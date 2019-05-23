import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { getWritableOperandName, isIdentifierDefinedInExportLet } from "./indexed";

function isUnaryExpressionNonStatement(
	parent: ts.Node<ts.ts.Node>,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	return !(
		ts.TypeGuards.isExpressionStatement(parent) ||
		(ts.TypeGuards.isForStatement(parent) && parent.getCondition() !== node)
	);
}

function getIncrementString(opKind: ts.ts.PrefixUnaryOperator, expStr: string, node: ts.Node, varName: string) {
	const op =
		opKind === ts.SyntaxKind.PlusPlusToken
			? " + "
			: opKind === ts.SyntaxKind.MinusMinusToken
			? " - "
			: (() => {
					throw new CompilerError(
						`Bad unary expression! (${opKind})`,
						node,
						CompilerErrorType.BadPrefixUnaryExpression,
					);
			  })();

	return `${varName ? `${varName} = ` : ""}${expStr}${op}1`;
}

export function compilePrefixUnaryExpression(state: CompilerState, node: ts.PrefixUnaryExpression) {
	const operand = node.getOperand();
	const opKind = node.getOperatorToken();
	if (opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) {
		const parent = node.getParentOrThrow();
		const isNonStatement = isUnaryExpressionNonStatement(parent, node);
		const expData = getWritableOperandName(state, operand);
		const { expStr } = expData;

		if (isNonStatement) {
			if (!ts.TypeGuards.isIdentifier(operand) || isIdentifierDefinedInExportLet(operand)) {
				const id = state.pushToDeclarationOrNewId(
					node,
					getIncrementString(opKind, expStr, node, ""),
					declaration => declaration.isIdentifier,
				);
				const context = state.getCurrentPrecedingStatementContext(node);
				const isPushed = context.isPushed;
				state.pushPrecedingStatements(node, state.indent + `${expStr} = ${id};\n`);
				context.isPushed = isPushed;
				return id;
			} else {
				const incrStr = getIncrementString(opKind, expStr, node, expStr);
				state.pushPrecedingStatements(node, state.indent + incrStr + ";\n");
				return expStr;
			}
		} else {
			return getIncrementString(opKind, expStr, node, expStr);
		}
	} else {
		const expStr = compileExpression(state, operand);
		const tokenKind = node.getOperatorToken();
		if (tokenKind === ts.SyntaxKind.ExclamationToken) {
			return `not ${expStr}`;
		} else if (tokenKind === ts.SyntaxKind.MinusToken) {
			return `-${expStr}`;
		} else if (tokenKind === ts.SyntaxKind.TildeToken) {
			state.usesTSLibrary = true;
			return `TS.bit_not(${expStr})`;
		} else {
			/* istanbul ignore next */
			throw new CompilerError(
				`Bad prefix unary expression! (${tokenKind})`,
				node,
				CompilerErrorType.BadPrefixUnaryExpression,
			);
		}
	}
}

export function compilePostfixUnaryExpression(state: CompilerState, node: ts.PostfixUnaryExpression) {
	const operand = node.getOperand();
	const opKind = node.getOperatorToken();
	if (opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) {
		const parent = node.getParentOrThrow();
		const isNonStatement = isUnaryExpressionNonStatement(parent, node);
		const expData = getWritableOperandName(state, operand);
		const { expStr } = expData;

		if (isNonStatement) {
			const declaration = state.declarationContext.get(node);
			let id: string;
			if (
				declaration &&
				(declaration.isIdentifier || expData.isIdentifier) &&
				declaration.set !== "return" &&
				declaration.set !== expStr
			) {
				state.declarationContext.delete(node);
				state.pushPrecedingStatements(
					node,
					state.indent + `${declaration.needsLocalizing ? "local " : ""}${declaration.set} = ${expStr};\n`,
				);
				// due to this optimization here, this shouldn't be shortened with `state.pushToDeclarationOrNewId`
				id = expData.isIdentifier ? expStr : declaration.set;
				const incrStr = getIncrementString(opKind, id, node, expStr);
				state.pushPrecedingStatements(node, state.indent + incrStr + ";\n");
			} else {
				id = state.pushPrecedingStatementToReuseableId(node, expStr);
				const incrStr = getIncrementString(opKind, id, node, expStr);
				state.pushPrecedingStatements(node, state.indent + incrStr + ";\n");
				state.getCurrentPrecedingStatementContext(node).isPushed = true;
			}

			return id;
		} else {
			return getIncrementString(opKind, expStr, node, expStr);
		}
	} else {
		/* istanbul ignore next */
		throw new CompilerError(
			`Bad postfix unary expression! (${opKind})`,
			node,
			CompilerErrorType.BadPostfixUnaryExpression,
		);
	}
}