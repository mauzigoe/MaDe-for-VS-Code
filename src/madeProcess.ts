import {
	Logger, logger,
	LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent,
	ProgressStartEvent, ProgressUpdateEvent, ProgressEndEvent, InvalidatedEvent,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint, MemoryEvent, Response
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { match, rejects } from 'assert';
import * as base64 from 'base64-js';
import { ChildProcess, exec, spawn, SpawnOptions, StdioPipe } from 'child_process';
import { debug, log } from 'console';
import { access, chmodSync, OpenDirOptions, RmOptions, write } from 'fs';
import { glob } from 'glob';
import { CommonFunctions } from 'mocha/lib/interfaces/common';
import { networkInterfaces, type } from 'os';
import { resolve } from 'path';
import { addListener, eventNames, exit, off, removeListener, stderr, stdout } from 'process';
import * as rl from 'readline';
import { Readline } from 'readline/promises';
import { EventEmitter, Readable, Stream } from 'stream';
import { setTimeout } from 'timers/promises';
import { isBuffer } from 'util';
import { setFlagsFromString } from 'v8';
import { OutputChannel, ProcessExecutionOptions, window } from 'vscode';
import './madeInfo';
import {PassThrough} from 'stream';
import { SrvRecord } from 'dns';
import { Func } from 'mocha';
import { isAnyArrayBuffer } from 'util/types';
import { ResolveType, RejectType, regexPrompt, regexMatchBeforePrompt, regexEvaluateArray, regexEvaluateValue, clearBreakpointResult, SetBreakpointResult, ContinueResult, EvaluateResult, regexShellMode, regexDebugMode, DefaultResult, SetBreakpointsResult, CdResult, NextResult, StackResult } from './madeInfo';
import { defaultOnRejectHandler, defaultOnResolveHandler, defaultStdErrHandler, defaultStdOutHandler, readyForInput, stackTraceOnRejectHandler, stackTraceOnResolveHandler, stackTraceStdOutHandler} from './outputHandler'
import './madeInfo'
import path = require('path');
import { MatlabDebugSession } from './madeDebug';

export interface MatlabDebugProcessOptions {
    runtimeOption: { stdio: [StdioPipe,StdioPipe,StdioPipe] },
    outputChannel?: OutputChannel 
}

enum STD_OUT_ERR { STD_OUT, STD_ERR };

export type FuncStruct<T> = {
    stdEmmit: EventEmitter,
    errEmmit: EventEmitter,
    promise: Promise<T>,
    stdoutFunc: ( resolve: ResolveType<T>, reject: RejectType<T>, stream: string) => void,
    stderrFunc: ( resolve: ResolveType<T>, reject: RejectType<T>, stream: string) => void,
    writeCmd: string
}


export class MaDeProcess {
    
    _runtime: ChildProcess;
    _bp_id = 0;
    _runtime_cmdStack: FuncStruct<any>[];
    _runtime_ready: Promise<boolean>;
    _this = this;

    _stdout_stream: string;
    _stderr_stream: string;

    _last_line: string;
    _source_file: string;

    _debugger_stdout_passthrough = new PassThrough;
    _debugger_stderr_passthrough = new PassThrough;

    _dap_event = new EventEmitter();
    constructor(command: string, argList: string[], options: MatlabDebugProcessOptions) {

        let _this = this;
        //this._runtime = spawn(command, argList, options.runtimeOption );
        this._runtime = spawn(command, argList );

        if(this._runtime.stdout){
            console.log('stdout exist')
        }
        else{
            console.log('stdout does not exist')
        }

        console.log(`regex.Prompt ${regexPrompt}`)

        this._debugger_stdout_passthrough = new PassThrough;
        this._debugger_stderr_passthrough = new PassThrough;

        this._runtime.stdout?.pipe(this._debugger_stdout_passthrough);
        this._runtime.stderr?.pipe(this._debugger_stderr_passthrough);

        this._last_line = "";
        this._stdout_stream = "";
        this._stderr_stream = "";
        this._runtime_cmdStack = [];

        this._runtime_ready = this.registerFuncstruct(defaultStdOutHandler, defaultStdErrHandler, "").then(defaultOnResolveHandler,defaultOnRejectHandler);

        this._debugger_stdout_passthrough.addListener("data", (data: string) => {
            console.log("debugger stdout")
            console.log(`data: ${data}`)
            let _this = this
            
            data.toString().match(regexMatchBeforePrompt)?.forEach(
                function (value) {
                    console.log(`value: ${value}`)
                    _this.tryCallbackFromCmdStack(value, STD_OUT_ERR.STD_OUT);
                }
            )
        })

        this._debugger_stderr_passthrough.addListener("data", (data: string) => {
            console.log("debugger stderr")
            this.tryCallbackFromCmdStack(data, STD_OUT_ERR.STD_ERR);
        })
       
        this._source_file = ""
        
    }

    public setSourceFile(sourceFile: string) {
        this._source_file = sourceFile
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
            writeCmd = `dbclear all\n`
        }
        else {
            writeCmd = `dbclear in ${path}\n`
        }

        return this.registerFuncstruct(defaultStdOutHandler,defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler,defaultOnRejectHandler);
    }

    public prepareDebugMode(srcPath: string): [Promise<boolean>,Promise<boolean>]{
        console.log('prepareDebugMode')
        let writeCmd = `dbstop in ${path.basename(srcPath)} at 0\n` 
        let cdProm = this.cd(path.dirname(srcPath));
        let dbModeProm = this.registerFuncstruct(defaultStdOutHandler,defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler, defaultOnRejectHandler)
        return [cdProm,dbModeProm]

    }
    
    /**
     * setBreakPoint
     */
    public setBreakpoints(path: string, line: number): Promise<SetBreakpointsResult> {

        let writeCmd = `dbstop in ${path} at ${line}\n` 

        return this.registerFuncstruct(defaultStdOutHandler, defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler, defaultOnRejectHandler)
            .then(
                (value)  => { return [value, line, this._bp_id++]}, 
                (reason) => { return [false, line, this._bp_id++] }
            );
    }   

    public async next(): Promise<NextResult> {

        let writeCmd = "dbstep\n"

        return this.registerFuncstruct(defaultStdOutHandler,defaultStdErrHandler,writeCmd)
            .then((value: any) => {this.sendEvent('stopOnStep');return defaultOnResolveHandler(value)},defaultOnRejectHandler)

    }

    public async cd(folder: string): Promise<CdResult> {
        let writeCmd = `cd ${folder}\n`
        return this.registerFuncstruct(defaultStdOutHandler,defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler,defaultOnRejectHandler)
    }

    public async continue(path?: string): Promise<ContinueResult> {
       
        let writeCmd;       
        //if (regex.ShellMode.test(this._last_line.toString())){
        if (!regexDebugMode.test(this._last_line)){
            if (path){
                writeCmd = `run("${path}")\n`;
            }
        }
        else {
            writeCmd = "dbcont\n";
        }

        if (writeCmd)
            return this.registerFuncstruct(defaultStdOutHandler, defaultStdErrHandler, writeCmd).then(defaultOnResolveHandler,defaultOnRejectHandler); 
        else 
            //this works given that the sourrounding registered function in a block are awaited  
            return Promise.reject(false)
    }

    /**
     * evaluate
     */
    /*
    public evaluate(varname: string) {
        console.log("evaluate")

        let _this = this;

        let stdoutFunc = function (resolve: ResolveType<EvaluateResult>, reject: RejectType<EvaluateResult>, stream: string) {
                if (readyForInput(stream)){

                    if (regexEvaluateArray.test(stream)){
                        let groups = [];
                        for (const match of stream.matchAll(regexEvaluateArray)) {
                            groups.push((match.groups?.dirtyvalue)?.replace("    ",",")); 
                        }

                        let array = groups?.join(",");
                        console.log(`array=${array}`);

                        if (array){
                            return resolve([array,"array"])
                        }
                        else {
                            reject(["",""])
                        }
                        
                    }
                    else if (regexEvaluateValue.test(stream)){
                        for (const match of stream.matchAll(regexEvaluateValue)) {
                            let array = (match.groups?.value)?.replace("    ",","); 
                            if (array){
                                return resolve([array,"array"])
                            }
                            else {
                                reject(["",""])
                            }
                        }
                    }
                    else {
                        reject(["",""])
                    }

                }
            }

        
        let stderrFunc = function (resolve: ResolveType<EvaluateResult>, reject: RejectType<EvaluateResult>, stream: string) {
            reject(["",""])
        }

        let writeCmd = `${varname}\n`

        let prom = this.registerFuncstruct(stdoutFunc, stderrFunc, writeCmd);

        return prom

    }
    */

    public async stack(): Promise<StackResult> {
        let writeCmd = "dbstack\n" 
        
        return this.registerFuncstruct(stackTraceStdOutHandler,defaultStdErrHandler,writeCmd).then(stackTraceOnResolveHandler,stackTraceOnRejectHandler);
    }

    // optionsInfo needs to be porperly typed
    private registerFuncstruct(stdoutFunc: ( resolve: ResolveType<DefaultResult>, reject: RejectType<DefaultResult>, stream: string) => void , stderrFunc: ( resolve: ResolveType<DefaultResult>, reject: RejectType<DefaultResult>, stream: string) =>void, writeCmd: string, optionsInfo?: any): Promise<DefaultResult>{

        console.log(`registerFuncStruct ${writeCmd}`)

        let funcstruct: FuncStruct<DefaultResult>; 

        let stdEmmit = new EventEmitter()
        let errEmmit = new EventEmitter()

        let prom = new Promise<DefaultResult>((resolve,reject)=>{

            let _resolve = (x:any) => {
                stdEmmit.removeAllListeners('dataout');
                errEmmit.removeAllListeners('dataerr');
                resolve(x)
            }

            let _reject = (x:any) => {
                stdEmmit.removeAllListeners('dataout');
                errEmmit.removeAllListeners('dataerr');
                reject(x)
            }

            stdEmmit.addListener('dataout', function (_stdout_stream) {return stdoutFunc(_resolve,_reject,_stdout_stream)});
            errEmmit.addListener('dataerr', function (_stderr_stream) {return stderrFunc(_resolve,_reject,_stderr_stream)});

        }).then(
            (value)=>{ 
                console.log(`shift stack. length: ${this._runtime_cmdStack.length}`); 
                if (optionsInfo){
                    this.sendEvent('output','out', `command '${writeCmd}' finished`, this._source_file, optionsInfo.line, optionsInfo.column);
                }
                this._runtime_cmdStack.shift(); 
                this._stdout_stream = ""
                this._stderr_stream = "";
                console.log(`shifted stack: ${this._runtime_cmdStack.length}`);
                return value
            },
            (reason: any ) => {
                this.sendEvent( 'output', 'err', `command '${writeCmd}' failed`,this._source_file, optionsInfo.line, optionsInfo.column);
                return reason 
            }
        )

        funcstruct = {
            stdEmmit: stdEmmit,
            errEmmit: errEmmit,
            promise: prom,
            stdoutFunc: stdoutFunc,
            stderrFunc: stderrFunc,
            writeCmd: writeCmd
        }
        
        this._runtime_cmdStack.push(funcstruct);

        this._runtime.stdin?.write(writeCmd)

        return prom

        }

    private tryCallbackFromCmdStack(stream: string , pipe: STD_OUT_ERR )  {
        
        console.log("tryCallbackFromCmdStack");

        this._last_line = stream.toString().split('\n').at(-1) ?? ""
        console.log(`stream ${stream}`)
        console.log(`_last_line ${this._last_line}`)

        if (this._runtime_cmdStack.length>0){
            let funcstruct: FuncStruct<any> = this._runtime_cmdStack[0];
            
            let proceed: boolean = false;

            if (pipe == STD_OUT_ERR.STD_OUT) {
                console.log(`stdoutStream for writeCmd: ${this._runtime_cmdStack[0].writeCmd}:\n${stream}`);
                console.log(`_runtime_cmdStack.length: ${this._runtime_cmdStack.length}`)
                this._stdout_stream += stream;
                funcstruct.stdEmmit.emit('dataout',this._stdout_stream);
            } else if (pipe == STD_OUT_ERR.STD_ERR) {
                console.log(`stderrStream for writeCmd: ${this._runtime_cmdStack[0].writeCmd}:\n${stream}`);
                this._stderr_stream += stream;
                funcstruct.stdEmmit.emit('dataerr');
            }
            else {
                console.error("Event occurred but could not be assigned")
            }
        }
        else {
            console.log("cmdStack empty")
        }

    }

    private stdoutFuncDefault(resolve: ResolveType<ContinueResult>, reject: RejectType<ContinueResult>, stream: string) {
        if (readyForInput(stream)) {
            resolve(true)
        }
    }

    private stderrFuncDefault(resolve: ResolveType<ContinueResult>, reject: RejectType<ContinueResult>, stream: string) {
        reject(false)
    }

    private isInDebugMode(){
        return regexDebugMode.test(this._last_line)
    }

    private sendEvent(reason: string, ...args: any[]){
        console.log('sendEvent')
		setTimeout(0).then(() => {
            this._dap_event.emit(reason, ...args)
        });
    }

}
