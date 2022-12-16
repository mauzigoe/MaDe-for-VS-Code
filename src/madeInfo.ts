import * as vscode from 'vscode';

export const matlabType = "matlab";
export const matlabDebugType = "matlabDebug";
export type RuntimeType = vscode.Terminal;

export type ResolveType<T> = (value: T | PromiseLike<T>) => void;
export type RejectType<T> = (value: T | PromiseLike<T>) => void;

export type DefaultResult = string;
export type DefaultResolveType = ResolveType<DefaultResult>;
export type DefaultRejectType = ResolveType<DefaultResult>;

export type SetBreakpointResult = boolean;
export type SetBreakpointsResult = [boolean, number, number];
export type ClearBreakpointResult = boolean;
export type ContinueResult = boolean;
export type CdResult = boolean;
export type NextResult = boolean;
export type MatlabType =  number | string | object | boolean ;

export type EvaluateValueResult = MatlabType| (MatlabType)[];
export type EvaluateValue = string | number;

export type EvaluateResult = string;

/*
export type EvaluateResult = { 
    var: string,
    value: EvaluateValue[]
};
*/

export type MadeFrame = {
    path: string,
    line: number,
    localFunc?: string
};

export type StackResult = MadeFrame[];

export const regexShellMode = />> /;
export const regexDebugMode = /K>> /;
export const regexPrompt = RegExp(`\\n?^(${regexShellMode.source}|${regexDebugMode.source})`,'m');
export const regexCaptureBeforePrompt = RegExp(`.+?(?=${regexPrompt.source})`,'gs');
export const regexMatchBeforePrompt = RegExp(`(?!>(${regexDebugMode.source}|${regexShellMode.source}))(?=.+)(?:.|\n)*?(${regexShellMode.source}|${regexDebugMode.source}|$)`,'g');
export const regexMatchBeforePromptWithoutGlobal = RegExp(`(?!>(${regexDebugMode.source}|${regexShellMode.source}))(?=.+)(?:.|\n)*?(${regexShellMode.source}|${regexDebugMode.source}|$)`,'g');

// for now dont capture functions in script file
export const regexDbStack = /In (?<path>.+?)(?:>(?<localFunc>.+?))* \(line (?<line>\d+)\)/g;

export const regexBreakpointStatus = /Breakpoint for ([a-zA-Z0-9\._-]+) is on line ([\d,]+)/;
export const regexStringIdicator = /"|'/;
export const regexSpaceOrLinebreak = /[\s\n]*/;

export const regexVarNumber = /\d+(?:,\d{3})*/;
export const regexVarFloat = RegExp(`${regexVarNumber.source}(?:\\.\\d+)?`);
export const regexVarString = /".*?"/;
export const regexVarName = /[A-Za-z]\w*/;
export const regexVarEqual = RegExp(`(?<varname>${regexVarName.source})\\s=`);

export const regexCaptureStatement = RegExp(`(${regexVarEqual.source})(.+?)(?=${regexVarName.source}\\s=|$)`,'gs');

export const regexVarValueTypes = RegExp(`${regexVarFloat.source}|${regexVarString.source}`);
export const regexCaptureColumns = RegExp(`.*Columns\\s${regexVarNumber.source}\\sthrough\\s${regexVarNumber.source}.*\n`,'g');
export const regexCaptureValues = RegExp(`${regexVarValueTypes.source}`,'g');

export const regexVarValue = RegExp(`(?<value>(${regexVarValueTypes.source}))`);
export const regexVarArrayColumns = RegExp(`${regexSpaceOrLinebreak.source}Columns\\s(?<min>\\d+)\\sthrough\\s(?<max>\\d+)${regexSpaceOrLinebreak.source}`);
export const regexVarArray = RegExp(`(?=${regexVarArrayColumns.source})((?:\\s{4}${regexVarValueTypes.source})+)`);

export const regexEndOfScript = RegExp(`^End of script`);
export const regexEvaluateArray = RegExp(`(?=${regexVarEqual})(?:${regexVarArray})`);
export const regexEvaluateValue = RegExp(`(?=${regexVarEqual})(?:${regexVarValue})`);

export const dapEvent: Record<string, string> = {
    stopOnBreakpoint : 'breakpoint',
    stopOnDataBreakpoint : 'data breakpoint',
    stopOnInstructionBreakpoint : 'instruction breakpoint',
    stopOnException : 'exception',
    breakpointValidated : 'changed',
    output : 'output',
    end : 'end'
};


export const madeError = {
    noStd : "stdin, stdout and/or stderr is not available",
};