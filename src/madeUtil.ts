import * as path from 'path';
import { RuntimeType } from "./madeInfo";

export function verifyBreakpoints(_runtime : RuntimeType, path: string, line: number){
    console.log(`dbstop in ${path} at ${line}`);
    _runtime.sendText(`dbstop in ${path} at ${line}`);
    if (_runtime.exitStatus !== undefined) {
        console.error(`Breakpoint at line ${line} in file ${path} could not be set.`);
        return false;
    }
    return true;
}

// TODO -> Write Error handler or change type to non-negative numbers
export function zeroBasedIndexToOneBasedIndex(index: number) : number {
    return index + 1;
}

// TODO -> Write Error handler or change type to postive numbers
export function oneBasedIndexToZeroBasedIndex(index: number) : number {

    return index - 1;
}