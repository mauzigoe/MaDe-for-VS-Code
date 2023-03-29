import {ResolveType, RejectType, regexPrompt, DefaultResult, DefaultResolveType, DefaultRejectType, regexDbStack, MadeFrame, regexDebugMode, regexShellMode, EvaluateResult, regexCaptureBeforePrompt} from './madeInfo';
import './madeInfo';

export function stackTraceOnResolveHandler(stream: string): MadeFrame[] {
    let madeStack: MadeFrame[] = [];
    let matchAllStack = [...stream.toString().matchAll(regexDbStack)];
    matchAllStack.forEach((value: RegExpMatchArray, index: number)=>{
        if (value.length === 4){
            madeStack = madeStack.concat([{ 
                path: value[1],
                line: parseInt(value[3]),
                localFunc: value[2]
            }]);
        }
        else if (value.length === 3 ){
            madeStack = madeStack.concat([{ 
                path: value[1],
                line: parseInt(value[2])
            }]);
        }
        else 
        {
            console.log("matched line `dbstack` without name capturing anything");
            console.log(`${value.groups}`);
        }
    });
    if (madeStack.length === 0){
        return [];
    }
    else {
        return madeStack;
    }
}

export function stackTraceOnRejectHandler(stream: string): MadeFrame[] {
    return [];
}
export function evaluateOnResolveHandler(stream: string) : string {
    let matchStream =  stream.match(regexCaptureBeforePrompt);
    if (matchStream){
        if (matchStream.length !== 1) {
            console.log(`matchStream.length != 1: value matchStream = ${matchStream}`);
            return stream;
        }
        return matchStream[0].toString();
    }
    else {
        return stream;
    }
}

export function evaluateOnRejectHandler(stream: string) {
    let ret: EvaluateResult[] = [];
    return ret;
}

export function stackTraceStdOutHandler(resolve: DefaultResolveType, reject: DefaultRejectType, stream: string) {
    if( readyForInputDebugMode(stream)) {
        resolve(stream);
    }
    else if (readyForInputShellMode(stream)){
        reject(stream);
    }
}

export function defaultOnResolveHandler(value: any): boolean {
    return true ;
}

export function defaultOnRejectHandler(value: any): boolean {
    return false;
}

export function shellInDebugModeDefaultOnResolveHandler(stream: string): boolean {
    return readyForInputDebugMode(stream);
}

export function shellInDebugModeDefaultOnRejectHandler(stream: string) {
    return false;
}

export function defaultStdOutHandler(resolve: DefaultResolveType, reject: DefaultRejectType, stream: string) {
    if (readyForInput(stream)){
        resolve(stream);
    }
}

export function defaultStdErrHandler(resolve: DefaultResolveType, reject: DefaultRejectType, stream: string) {
    reject(stream);
}

export function readyForInput(line: string){
    return regexPrompt.test(line);
}

export function readyForInputDebugMode(line: string){
    return regexDebugMode.test(line);
}

export function readyForInputShellMode(line: string){
    return regexShellMode.test(line);
}
