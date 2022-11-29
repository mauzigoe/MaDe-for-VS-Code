import {ResolveType, RejectType, regexPrompt, SetBreakpointResult, DefaultResult, DefaultResolveType, DefaultRejectType, regexDbStack, MadeFrame, regexDebugMode, regexShellMode} from './madeInfo'
import './madeInfo'
import { MatlabDebugSession } from './madeDebug'
import { Stream } from 'stream'
import { Breakpoint } from '@vscode/debugadapter'
import { resolve } from 'path'
import { rejects } from 'assert'

export function stackTraceOnResolveHandler(stream: string) {
    console.log("stackTraceOnResolve");
    let madeStack: MadeFrame[] = [];
    let matchAllStack = [...stream.toString().matchAll(regexDbStack)]
    console.log(matchAllStack)
    matchAllStack.forEach((value: RegExpMatchArray, index: number)=>{
        madeStack = madeStack.concat([{ 
            path: value[1],
            line: parseInt(value[2])
        }])
        console.log(madeStack)
    })
    madeStack = madeStack.reverse()
    if (madeStack.length == 0){
        return []
    }
    else {
        return madeStack
    }
}

export function stackTraceOnRejectHandler(stream: string) {
    return []
}

export function stackTraceStdOutHandler(resolve: DefaultResolveType, reject: DefaultRejectType, stream: string): DefaultRejectType | DefaultResolveType | void {
    if( readyForInputDebugMode(stream)) {
        resolve(stream)
    }
    else if (readyForInputShellMode(stream)){
        reject(stream)
    }
}

export function defaultOnResolveHandler(value: any) {
   return true 
}

export function defaultOnRejectHandler(value: any) {
    return false
}

export function defaultStdOutHandler(resolve: DefaultResolveType, reject: DefaultRejectType, stream: string): RejectType<DefaultResult> | ResolveType<DefaultResult> | void {
    if (readyForInput(stream)){
        resolve(stream);
    }
}

export function defaultStdErrHandler(resolve: DefaultResolveType, reject: DefaultRejectType, stream: string): RejectType<DefaultResult> | ResolveType<DefaultResult> | void {
   reject(stream)
}

export function readyForInput(line: string){
    return regexPrompt.test(line)
}

export function readyForInputDebugMode(line: string){
    return regexDebugMode.test(line)
}

export function readyForInputShellMode(line: string){
    return regexShellMode.test(line)
}
