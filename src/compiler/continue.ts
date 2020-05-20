import * as ts from "ts-morph";
import { CompilerState } from "../CompilerState";
import { shouldForkForTryCatchFinally } from ".";

export function compileContinueStatement(state: CompilerState, node: ts.ContinueStatement) {
	if (shouldForkForTryCatchFinally(node, true)) {
		return state.indent + `return {"continue"};\n`;
	}
	return state.indent + `_continue_${state.continueId} = true; break;\n`;
}
