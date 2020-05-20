import * as ts from "ts-morph";
import { compileStatementedNode, nodeHasParameters, nodeIsLoop, hasContinueDescendant, hasBreakDescendant } from ".";
import { CompilerState } from "../CompilerState";
import { checkReserved } from "./security";

export function getLastTryAncestor(node: ts.Node, filter: (node: ts.Node) => boolean): ts.TryStatement | undefined {
	let tryAncestor: ts.TryStatement | undefined;
	while (true) {
		const nextTryAncestor = node.getFirstAncestor(ancestor => {
			return filter(ancestor) || ts.TypeGuards.isTryStatement(ancestor);
		});
		if (!nextTryAncestor || filter(nextTryAncestor)) {
			break;
		}
		tryAncestor = nextTryAncestor as ts.TryStatement;
		node = tryAncestor;
	}
	return tryAncestor;
}

export function shouldForkForTryCatchFinally(node: ts.Node, isLoop: boolean): boolean {
	const lastTryAncestorInLoop = getLastTryAncestor(node, (ancestor: ts.Node) => {
		return nodeHasParameters(ancestor) || (isLoop && nodeIsLoop(ancestor));
	});
	return lastTryAncestorInLoop !== undefined;
}

export function compileTryStatement(state: CompilerState, node: ts.TryStatement) {
	const tryBlock = node.getTryBlock();

	const hasParentTryBeforeFunctionStart = shouldForkForTryCatchFinally(node, false);

	const hasParentTryBeforeLoopStart = shouldForkForTryCatchFinally(node, true);

	const funcAncestor = node.getFirstAncestor(ancestor => nodeHasParameters(ancestor));
	let loopAncestor = node.getFirstAncestor(ancestor => nodeIsLoop(ancestor) || nodeHasParameters(ancestor));

	if (loopAncestor && !nodeIsLoop(loopAncestor)) {
		loopAncestor = undefined;
	}

	let result = "";

	let hasErrVar = false;
	const catchClause = node.getCatchClause();
	if (catchClause) {
		hasErrVar = catchClause.getVariableDeclaration() !== undefined;
	}

	const errMsgId = catchClause ? state.getNewId() : "";
	const tracebackId = state.getNewId();

	const forkStatementId = state.getNewId();
	const successId = state.getNewId();

	if (hasErrVar) {
		result += state.indent + `local ${errMsgId}, ${tracebackId};\n`;
	} else {
		result += state.indent + `local ${tracebackId};\n`;
	}
	result += state.indent;
	result += `local ${successId}, ${forkStatementId} = `;
	result += `xpcall(function()\n`;

	state.pushIndent();
	result += compileStatementedNode(state, tryBlock);
	state.popIndent();
	result += state.indent + `end,\n`;
	result += state.indent + `function(err)\n`;
	state.pushIndent();
	if (hasErrVar) {
		result += state.indent + `${errMsgId} = err;\n`;
	}
	result += state.indent + `${tracebackId} = debug.traceback();\n`;
	state.popIndent();
	result += state.indent + `end);\n`;

	state.pushTryTracebackId(tracebackId);
	if (catchClause) {
		result += state.indent + `if not ${successId} then\n`;
		state.pushIndent();
		if (hasErrVar) {
			const variableDeclaration = catchClause.getVariableDeclarationOrThrow().getNameNode();
			const varName = checkReserved(variableDeclaration);
			result += state.indent + `local ${varName} = ${errMsgId};\n`;
		}
		result += state.indent + `${forkStatementId} = (function()\n`;
		state.pushIndent();
		result += compileStatementedNode(state, catchClause.getBlock());
		state.popIndent();
		result += state.indent + `end)();\n`;
		state.popIndent();
		result += state.indent + `end;\n`;
	}
	state.popTryTracebackId();

	const finallyBlock = node.getFinallyBlock();
	if (finallyBlock) {
		result += state.indent + `${forkStatementId} = (function()\n`;
		state.pushIndent();
		result += compileStatementedNode(state, finallyBlock);
		state.popIndent();
		result += state.indent + `end)();\n`;
	}

	if (loopAncestor || funcAncestor) {
		result += state.indent + `if ${forkStatementId} then\n`;
		state.pushIndent();
		if (hasParentTryBeforeLoopStart && hasParentTryBeforeFunctionStart) {
			result += state.indent + `return ${forkStatementId};\n`;
		} else {
			if (loopAncestor) {
				if (hasParentTryBeforeLoopStart) {
					result +=
						state.indent +
						`if ${forkStatementId}[1] == "break" or ${forkStatementId}[1] == "continue" then\n`;
					state.pushIndent();
					result += state.indent + `return ${forkStatementId};\n`;
					state.popIndent();
					result += state.indent + `end;\n`;
				} else {
					const loopAncestorHasContinue = hasContinueDescendant(loopAncestor);
					const loopAncestorHasBreak = hasBreakDescendant(loopAncestor);
					if (loopAncestorHasBreak) {
						result += state.indent + `if ${forkStatementId}[1] == "break" then\n`;
						state.pushIndent();
						result += state.indent + `break;\n`;
						state.popIndent();
						result += state.indent + `end;\n`;
					}
					if (loopAncestorHasContinue) {
						result += state.indent + `if ${forkStatementId}[1] == "continue" then\n`;
						state.pushIndent();
						result += state.indent + `_continue_${state.continueId} = true; break;\n`;
						state.popIndent();
						result += state.indent + `end;\n`;
					}
				}
			}
			if (funcAncestor) {
				result += state.indent + `if ${forkStatementId}[1] == "return" then\n`;
				state.pushIndent();
				if (hasParentTryBeforeFunctionStart) {
					result += state.indent + `return ${forkStatementId};\n`;
				} else {
					result += state.indent + `return table.unpack(${forkStatementId}, 2, ${forkStatementId}.n);\n`;
				}
				state.popIndent();
				result += state.indent + `end;\n`;
			}
		}
		state.popIndent();
		result += state.indent + `end;\n`;
	}

	return result;
}
