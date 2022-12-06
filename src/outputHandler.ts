import {ResolveType, RejectType, regexPrompt, SetBreakpointResult, DefaultResult, DefaultResolveType, DefaultRejectType, regexDbStack, MadeFrame, regexDebugMode, regexShellMode, regexEvaluateArray, regexEvaluateValue, regexCaptureColumns, regexCaptureValues, EvaluateValue, EvaluateResult, regexCaptureStatement, regexVarEqual, regexCaptureBeforePrompt} from './madeInfo'
import './madeInfo'
import { MatlabDebugSession } from './madeDebug'
import { Stream } from 'stream'
import { Breakpoint } from '@vscode/debugadapter'
import { resolve } from 'path'
import { match, rejects } from 'assert'

export function stackTraceOnResolveHandler(stream: string) {
    let madeStack: MadeFrame[] = [];
    let matchAllStack = [...stream.toString().matchAll(regexDbStack)]
    matchAllStack.forEach((value: RegExpMatchArray, index: number)=>{
        madeStack = madeStack.concat([{ 
            path: value[1],
            line: parseInt(value[2])
        }])
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
export function evaluateOnResolveHandler(stream: string) {
    let matchStream =  stream.match(regexCaptureBeforePrompt)
    if (matchStream){
        if (matchStream.length != 1) {
            console.log(`matchStream.length != 1: value matchStream = ${matchStream}`)
            return stream
        }
        return matchStream[0]
    }
    else {
        return stream
    }
}

export function evaluateOnRejectHandler(stream: string) {
    let ret: EvaluateResult[] = [];
    return ret
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
