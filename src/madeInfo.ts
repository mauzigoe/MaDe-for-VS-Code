import * as vscode from 'vscode'
import EventEmitter = require('events');
import { OutputChannel } from 'vscode';
import { StdioPipe } from 'child_process';
import { Breakpoint } from '@vscode/debugadapter';
import { Interface } from 'readline';

export const matlabType = "matlab";
export const matlabDebugType = "matlabDebug"
export type runtimeType = vscode.Terminal;

export type ResolveType<T> = (value: T | PromiseLike<T>) => void;
export type RejectType<T> = (value: T | PromiseLike<T>) => void;

export type DefaultResult = string;
export type DefaultResolveType = ResolveType<DefaultResult>
export type DefaultRejectType = ResolveType<DefaultResult>

export type SetBreakpointResult = boolean;
export type SetBreakpointsResult = [boolean, number, number];
export type clearBreakpointResult = boolean;
export type ContinueResult = boolean;
export type CdResult = boolean;
export type NextResult = boolean;
export type MatlabType =  number | string | object | boolean ;
export type EvaluateValueResult = MatlabType| (MatlabType)[]
export type EvaluateResult = [ string, string ];

export type MadeFrame = {
    path: string,
    line: number,
}
export type StackResult = MadeFrame[];

export const regexShellMode = />> /;
export const regexDebugMode = /K>> /;
export const regexPrompt = RegExp(`(^|\n)(?=${regexShellMode.source}|${regexDebugMode.source})`);
export const regexMatchBeforePrompt = RegExp(`(?!>(${regexDebugMode.source}|${regexShellMode.source}))(?=.+)(?:.|\n)*?(${regexShellMode.source}|${regexDebugMode.source}|$)`,'g');

// for now dont capture functions in script file
export const regexDbStack = /In (.+?)(?:>.+?)* \(line (\d+)\)/g

export const regexBreakpointStatus = /Breakpoint for ([a-zA-Z0-9\._-]+) is on line ([\d,]+)/;
export const regexStringIdicator = /"|'/;
export const regexSpaceOrLinebreak = /[\s\n]+/;

export const regexVarNumber = /\d\.\d+/;
export const regexVarString = /".*"/;
export const regexVarName = /\w[\w\d_]+/;
export const regexVarEqual = RegExp(`${regexSpaceOrLinebreak.source}^${regexVarName.source}\s=${regexSpaceOrLinebreak.source}`);
export const regexVarValueTypes = RegExp(`${regexVarNumber.source}|${regexVarString.source}`);
export const regexVarValue = RegExp(`(?<diryvalue>${regexVarNumber.source}|${regexVarString.source})`);
export const regexVarArrayColumns = RegExp(`${regexSpaceOrLinebreak.source}Columns\s(\d+)\sthrough\s(\d+)[\s\n]+`);
export const regexVarArray = RegExp(`(?<=${regexVarArrayColumns.source})\s{4}(?<dirtyarray>${regexVarValueTypes.source}(?:\s{4}${regexVarValueTypes.source})+)+`);

export const regexEndOfScript = RegExp(`^End of script`);
export const regexEvaluateArray = RegExp(`(?<=${regexVarEqual})(?=${regexVarArray})`);
export const regexEvaluateValue = RegExp(`(?<=${regexVarEqual})(?=${regexVarValue})`);

export const DapEvent: Record<string, string> = {
    StopOnBreakpoint : 'breakpoint',
    StopOnDataBreakpoint : 'data breakpoint',
    StopOnInstructionBreakpoint : 'instruction breakpoint',
    StopOnException : 'exception',
    BreakpointValidated : 'changed',
    output : 'output',
    end : 'end'
}