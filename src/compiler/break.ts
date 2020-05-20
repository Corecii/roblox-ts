import * as ts from "ts-morph";
import { CompilerState } from "../CompilerState";
import { shouldForkForTryCatchFinally } from ".";

export function compileBreakStatement(state: CompilerState, node: ts.BreakStatement) {
	if (shouldForkForTryCatchFinally(node, true)) {
		return state.indent + `return {"break"};\n`;
	}
	return state.indent + "break;\n";
}
