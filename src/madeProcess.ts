import { ChildProcess, spawn, StdioPipe } from 'child_process';
import { EventEmitter} from 'stream';
import { setTimeout } from 'timers/promises';
import { OutputChannel} from 'vscode';
import './madeInfo';
import {PassThrough} from 'stream';
import { ResolveType, RejectType, ContinueResult, EvaluateResult, regexDebugMode, DefaultResult, SetBreakpointsResult, CdResult, NextResult, StackResult, madeError, regexMatchBeforePromptWithoutGlobal } from './madeInfo';
import { defaultOnRejectHandler, defaultOnResolveHandler, defaultStdErrHandler, defaultStdOutHandler, evaluateOnResolveHandler, stackTraceOnRejectHandler, stackTraceOnResolveHandler, stackTraceStdOutHandler} from './outputHandler';
import './madeInfo';
import * as path from 'path';

export interface MatlabDebugProcessOptions {
    runtimeOption: { stdio: [StdioPipe,StdioPipe,StdioPipe] },
    outputChannel?: OutputChannel 
}

enum StdOutErr { stdOut, stdErr };

export type FuncStruct<T> = {
    stdEmmit: EventEmitter,
    errEmmit: EventEmitter,
    promise: Promise<T>,
    stdoutFunc: ( resolve: ResolveType<T>, reject: RejectType<T>, stream: string) => void,
    stderrFunc: ( resolve: ResolveType<T>, reject: RejectType<T>, stream: string) => void,
    writeCmd: string
};


export class MaDeProcess {
    
    _runtime: ChildProcess;
    bpId = 0;
    runtimeCmdStack: FuncStruct<any>[];
    runtimeReady: Promise<boolean>;
    _this = this;

    stdoutStream: string;
    stderrStream: string;

    lastLine: string;
    sourceFile: string;

    debuggerStdoutPassthrough = new PassThrough;
    debuggerStderrPassthrough = new PassThrough;

    dapEvent = new EventEmitter();
    constructor(command: string, argList: string[], options: MatlabDebugProcessOptions) {

        //this._runtime = spawn(command, argList, options.runtimeOption );
        this._runtime = spawn(command, argList );

        if(!(this._runtime.stdout && this._runtime.stderr && this._runtime.stdin)){
            this.throwError(madeError.noStd);
        }

        this.debuggerStdoutPassthrough = new PassThrough;
        this.debuggerStderrPassthrough = new PassThrough;

        this._runtime.stdout?.pipe(this.debuggerStdoutPassthrough);
        this._runtime.stderr?.pipe(this.debuggerStderrPassthrough);

        this.lastLine = "";
        this.stdoutStream = "";
        this.stderrStream = "";
        this.runtimeCmdStack = [];

        this.runtimeReady = this.registerFuncstruct(defaultStdOutHandler, defaultStdErrHandler, "").then(defaultOnResolveHandler,defaultOnRejectHandler);

        this.debuggerStdoutPassthrough.addListener("data", (data: string) => {
            let _this = this;
            
            data.toString().match(regexMatchBeforePromptWithoutGlobal)?.forEach(
                function (value) {
                    _this.tryCallbackFromCmdStack(value, StdOutErr.stdOut);
                }
            );
        });

        this.debuggerStderrPassthrough.addListener("data", (data: string) => {
            this.tryCallbackFromCmdStack(data, StdOutErr.stdErr);
        });
       
        this.sourceFile = "";
        
    }

    public setSourceFile(sourceFile: string) {
        this.sourceFile = sourceFile;
    }

    public initializeOnlyShell(): Promise<boolean> {
        return this.registerFuncstruct(defaultStdOutHandler, defaultStdErrHandler, "s = settings; s.matlab.editor.OpenFileAtBreakpoint.TemporaryValue = 0; clear s\n").then(defaultOnResolveHandler,defaultOnRejectHandler);
    }
    
     /**
     * setBreakPoint
     */
    //public async setBreakPoint(path: string, line: number) {
    public clearBreakpoints(path: string | unknown): Promise<boolean> {
        let writeCmd;

        if (!path) {
            writeCmd = `dbclear all\n`;
        }
        else {
            writeCmd = `dbclear in ${path}\n`;
        }

        return this.registerFuncstruct(defaultStdOutHandler,defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler,defaultOnRejectHandler);
    }

    public prepareDebugMode(srcPath: string): [Promise<boolean>,Promise<boolean>]{
        let writeCmd = `dbstop in ${path.basename(srcPath)} at 0\n` ;
        let cdProm = this.cd(path.dirname(srcPath));
        let dbModeProm = this.registerFuncstruct(defaultStdOutHandler,defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler, defaultOnRejectHandler);
        return [cdProm,dbModeProm];

    }
    
    /**
     * setBreakPoint
     */
    public setBreakpoints(path: string, line: number): Promise<SetBreakpointsResult> {

        let writeCmd = `dbstop in ${path} at ${line}\n`;

        return this.registerFuncstruct(defaultStdOutHandler, defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler, defaultOnRejectHandler)
            .then(
                (value)  => { 
                    return [value, line, this.bpId++];
                }, 
                (reason) => {
                    return [false, line, this.bpId++];
                }
            );
    }   

    public async next(): Promise<NextResult> {

        let writeCmd = "dbstep\n";

        return this.registerFuncstruct(defaultStdOutHandler,defaultStdErrHandler,writeCmd)
            .then(
                (value: any) => {
                    this.sendEvent('stopOnStep');return defaultOnResolveHandler(value);
                },
                defaultOnRejectHandler
            );

    }

    public async cd(folder: string): Promise<CdResult> {
        let writeCmd = `cd ${folder}\n`;
        return this.registerFuncstruct(defaultStdOutHandler,defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler,defaultOnRejectHandler);
    }

    public async continue(path?: string): Promise<ContinueResult> {
       
        let writeCmd;       
        //if (regex.ShellMode.test(this._last_line.toString())){
        if (!regexDebugMode.test(this.lastLine)){
            if (path){
                writeCmd = `run("${path}")\n`;
            }
        }
        else {
            writeCmd = "dbcont\n";
        }

        let prom: Promise<ContinueResult>;
        if (writeCmd){
            prom = this.registerFuncstruct(defaultStdOutHandler, defaultStdErrHandler, writeCmd).then(defaultOnResolveHandler,defaultOnRejectHandler); 
        }
        else {
            prom = Promise.reject(false);
        }
            //this works given that the sourrounding registered function in a block are awaited  

        return prom;
    }

    /**
     * evaluate
     */
    public evaluate(varname: string): Promise<EvaluateResult> {
        let writeCmd = `${varname}\n`;

        let prom = this.registerFuncstruct(defaultStdOutHandler, defaultStdErrHandler, writeCmd).then(evaluateOnResolveHandler);

        return prom;

    }

    public async stack(): Promise<StackResult> {
        let writeCmd = "dbstack('-completenames')\n";
        
        return this.registerFuncstruct(stackTraceStdOutHandler,defaultStdErrHandler,writeCmd).then(stackTraceOnResolveHandler,stackTraceOnRejectHandler);
    }

    // optionsInfo needs to be porperly typed
    private registerFuncstruct(
        stdoutFunc: ( resolve: ResolveType<DefaultResult>, reject: RejectType<DefaultResult>, stream: string) => void,
        stderrFunc: ( resolve: ResolveType<DefaultResult>, reject: RejectType<DefaultResult>, stream: string) =>void,
        writeCmd: string, optionsInfo?: any): Promise<DefaultResult>{

        let funcstruct: FuncStruct<DefaultResult>; 

        let stdEmmit = new EventEmitter();
        let errEmmit = new EventEmitter();

        let prom = new Promise<DefaultResult>((resolve,reject)=>{

            let _resolve = (x:any) => {
                stdEmmit.removeAllListeners('dataout');
                errEmmit.removeAllListeners('dataerr');
                this.cleanElementOnStack();
                resolve(x);
            };

            let _reject = (x:any) => {
                stdEmmit.removeAllListeners('dataout');
                errEmmit.removeAllListeners('dataerr');
                this.cleanElementOnStack();
                reject(x);
            };

            stdEmmit.addListener('dataout', function (stdoutStream: string) {return stdoutFunc(_resolve,_reject,stdoutStream);});
            errEmmit.addListener('dataerr', function (stderrStream: string) {return stderrFunc(_resolve,_reject,stderrStream);});

        }).then(
            (value)=>{ 
                console.log(`writeCmd ${funcstruct.writeCmd} resolved`);
                return value;
            },
            (reason: any ) => {
                console.log(`writeCmd ${funcstruct.writeCmd} rejected`);
                return reason; 
            }
        ).catch(
            (reason: any) => {
                console.log(`writeCmd ${funcstruct.writeCmd} catched`);
            }
        );

        funcstruct = {
            stdEmmit: stdEmmit,
            errEmmit: errEmmit,
            promise: prom,
            stdoutFunc: stdoutFunc,
            stderrFunc: stderrFunc,
            writeCmd: writeCmd
        };
        
        this.runtimeCmdStack.push(funcstruct);

        this._runtime.stdin?.write(writeCmd);

        return prom;

        }

    private tryCallbackFromCmdStack(stream: string , pipe: StdOutErr )  {
        this.lastLine = stream.toString().split('\n').at(-1) ?? "";
        
        if (this.runtimeCmdStack.length>0){
            let funcstruct: FuncStruct<any> = this.runtimeCmdStack[0];
            
            if (pipe === StdOutErr.stdOut) {
                this.stdoutStream += stream;
                funcstruct.stdEmmit.emit('dataout',this.stdoutStream);
            } else if (pipe === StdOutErr.stdErr) {
                this.stderrStream += stream;
                funcstruct.stdEmmit.emit('dataerr');
            }
            else {
                console.error("Event occurred but could not be assigned");
            }
        }
        else {
            console.error("cmdStack empty");
        }

    }

    private sendEvent(reason: string, ...args: any[]){
		setTimeout(0).then(() => {
            this.dapEvent.emit(reason, ...args);
        });
    }

    private throwError(reason: string): never{
        throw new Error(reason);
    }

    private cleanElementOnStack(){
        console.log(`cleanElementOnStack`);
        this.runtimeCmdStack.shift(); 
        this.stdoutStream = this.stdoutStream.toString().replace(regexMatchBeforePromptWithoutGlobal,""); 
        this.stderrStream = this.stdoutStream.toString().replace(regexMatchBeforePromptWithoutGlobal,""); 
        console.log(`new stack length: ${this.runtimeCmdStack.length}`);
        if (this.runtimeCmdStack.length >= 1){
            console.log(`nextCmd: ${this.runtimeCmdStack[0].writeCmd}`);
        }
    }

}

