import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { skipNodesDownwards } from "../utility/general";

export function compileThrowStatement(state: CompilerState, node: ts.ThrowStatement) {
	const expression = skipNodesDownwards(node.getExpression());
	if (!expression) {
		throw new CompilerError("Empty throws are not supported!", node, CompilerErrorType.EmptyThrow);
	}
	state.enterPrecedingStatementContext();
	const err = compileExpression(state, expression);
	return state.exitPrecedingStatementContextAndJoin() + state.indent + `error(${err});\n`;
}
