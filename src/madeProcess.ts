import { ChildProcess, spawn, StdioPipe } from 'child_process';
import { EventEmitter} from 'stream';
import { setTimeout } from 'timers/promises';
import './madeInfo';
import {PassThrough} from 'stream';
import { ResolveType, RejectType, ContinueResult, DefaultResult, CdResult, StackResult, madeError, regexMatchBeforePromptWithoutGlobal } from './madeInfo';
import { defaultOnRejectHandler, defaultOnResolveHandler, defaultStdErrHandler, defaultStdOutHandler, shellInDebugModeDefaultOnRejectHandler, shellInDebugModeDefaultOnResolveHandler, stackTraceOnRejectHandler, stackTraceOnResolveHandler, stackTraceStdOutHandler} from './outputHandler';
import './madeInfo';
import * as path from 'path';

export interface MatlabDebugProcessOptions {
    runtimeOption: { stdio: [StdioPipe,StdioPipe,StdioPipe] },
}

enum StdOutErr { stdOut, stdErr };

export type FuncStruct<T> = {
    stdEmmit: EventEmitter,
    errEmmit: EventEmitter,
    promise: Promise<T>,
    stdoutFunc: ( resolve: ResolveType<T>, reject: RejectType<T>, stream: string) => void,
    stderrFunc: ( resolve: ResolveType<T>, reject: RejectType<T>, stream: string) => void,
    writeCmd: string,
    stdout: string,
    stderr: string,
};


export class MaDeProcess {
    
    _runtime: ChildProcess;
    bpId = 0;
    runtimeCmdStack: FuncStruct<any>[] = [];
    runtimeReady: Promise<boolean>;
    _this = this;

    lastLine: string = "";

    debuggerStdoutPassthrough: PassThrough = new PassThrough;
    debuggerStderrPassthrough: PassThrough = new PassThrough;

    dapEvent = new EventEmitter();

    constructor(command: string, argList: string[], options: MatlabDebugProcessOptions) {

        this._runtime = spawn(command, argList);

        if(!(this._runtime.stdout && this._runtime.stderr && this._runtime.stdin)){
            this.throwError(madeError.noStd);
        }

        this._runtime.stdout?.pipe(this.debuggerStdoutPassthrough);
        this._runtime.stderr?.pipe(this.debuggerStderrPassthrough);

        this.runtimeReady = this.enqueMatlabCmd(defaultStdOutHandler, defaultStdErrHandler, "").then(defaultOnResolveHandler,defaultOnRejectHandler);

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
        
    }

    public inhibitGuiForDebugMode(): Promise<boolean> {
        return this.enqueMatlabCmd(defaultStdOutHandler, defaultStdErrHandler, "s = settings; s.matlab.editor.OpenFileAtBreakpoint.TemporaryValue = 0; clear s\n").then(defaultOnResolveHandler,defaultOnRejectHandler);
    }

    public prepareDebugMode(srcPath: string): [Promise<boolean>,Promise<boolean>]{
        let writeCmd = `dbstop in ${path.basename(srcPath)} at 0\n` ;
        let cdProm = this.cd(path.dirname(srcPath));
        let dbModeProm = this.enqueMatlabCmd(defaultStdOutHandler,defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler, defaultOnRejectHandler);
        return [cdProm,dbModeProm];

    }

    public async cd(folder: string): Promise<CdResult> {
        let writeCmd = `cd ${folder}\n`;
        return this.enqueMatlabCmd(defaultStdOutHandler,defaultStdErrHandler,writeCmd).then(defaultOnResolveHandler,defaultOnRejectHandler);
    }

    public async runOrDbcont(isInDebugMode: boolean, path?: string): Promise<ContinueResult> {
       
        let writeCmd;       
        //if (regex.ShellMode.test(this._last_line.toString())){
        if (!isInDebugMode){
            if (path){
                writeCmd = `run("${path}")\n`;
            }
        }
        else {
            writeCmd = "dbcont\n";
        }

        let prom: Promise<ContinueResult>;
        if (writeCmd){
            prom = this.enqueMatlabCmd(defaultStdOutHandler, defaultStdErrHandler, writeCmd).then(defaultOnResolveHandler,defaultOnRejectHandler); 
        }
        else {
            prom = Promise.reject(false);
        }
            //this works given that the sourrounding registered function in a block are awaited  

        return prom;
    }

    public async stack(): Promise<StackResult> {
        let writeCmd = "dbstack('-completenames')\n";
        
        return this.enqueMatlabCmd(stackTraceStdOutHandler,defaultStdErrHandler,writeCmd).then(stackTraceOnResolveHandler,stackTraceOnRejectHandler);
    }

    public isInDebugMode(): Promise<boolean> {
        let writeCmd = "\n";

        return this.enqueMatlabCmd(defaultStdOutHandler, defaultStdErrHandler, writeCmd).then(shellInDebugModeDefaultOnResolveHandler,shellInDebugModeDefaultOnRejectHandler);

    }

    // optionsInfo needs to be porperly typed
    public enqueMatlabCmd(
        stdoutFunc: ( resolve: ResolveType<DefaultResult>, reject: RejectType<DefaultResult>, stream: string) => void,
        stderrFunc: ( resolve: ResolveType<DefaultResult>, reject: RejectType<DefaultResult>, stream: string) => void,
        writeCmd: string, optionsInfo?: any): Promise<DefaultResult>{

        let stdEmmit = new EventEmitter();
        let errEmmit = new EventEmitter();

        let prom: Promise<string> = new Promise<DefaultResult>((resolve,reject)=>{

            let _resolve = (x:any) => {
                console.log(`writeCmd: ${writeCmd}`);
                console.log(`resolved`);
                stdEmmit.removeAllListeners('dataout');
                errEmmit.removeAllListeners('dataerr');
                this.cleanElementOnStack();
                resolve(x);
            };

            let _reject = (x:any) => {
                console.log(`writeCmd: ${writeCmd}`);
                console.log(`rejected`);
                stdEmmit.removeAllListeners('dataout');
                errEmmit.removeAllListeners('dataerr');
                this.cleanElementOnStack();
                reject(x);
            };

            stdEmmit.addListener('dataout', function (stdoutStream: string) {return stdoutFunc(_resolve,_reject,stdoutStream);});
            errEmmit.addListener('dataerr', function (stderrStream: string) {return stderrFunc(_resolve,_reject,stderrStream);});

        });

        let funcstruct: FuncStruct<DefaultResult> = {
            stdEmmit: stdEmmit,
            errEmmit: errEmmit,
            promise: prom,
            stdoutFunc: stdoutFunc,
            stderrFunc: stderrFunc,
            writeCmd: writeCmd,
            stdout: "",
            stderr: "",
        };
        
        this.runtimeCmdStack.push(funcstruct);

        this._runtime.stdin?.write(writeCmd);

        return prom;

        }

    private tryCallbackFromCmdStack(stream: string , pipe: StdOutErr )  {
        this.lastLine = stream.toString().split('\n').at(-1) ?? "";
        console.log(stream.toString());
        
        if (this.runtimeCmdStack.length>0){
            let funcstruct: FuncStruct<any> = this.runtimeCmdStack[0];
            
            if (pipe === StdOutErr.stdOut) {
                funcstruct.stdout += stream;
                funcstruct.stdEmmit.emit('dataout', funcstruct.stdout);
            } else if (pipe === StdOutErr.stdErr) {
                funcstruct.stderr += stream;
                // send stderr too maybe?
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

    public sendEvent(reason: string, ...args: any[]){
		setTimeout(0).then(() => {
            this.dapEvent.emit(reason, ...args);
        });
    }

    private throwError(reason: string): never{
        throw new Error(reason);
    }

    private cleanElementOnStack(){
        
        console.log(`cleanElementOnStack`);

        let stdout = this.runtimeCmdStack[0].stdout.toString().replace(regexMatchBeforePromptWithoutGlobal,"");;
        let stderr = this.runtimeCmdStack[0].stderr.toString().replace(regexMatchBeforePromptWithoutGlobal,"");;  
        
        this.runtimeCmdStack.shift();
        console.log(`new stack length: ${this.runtimeCmdStack.length}`);

        if (this.runtimeCmdStack.length > 0){
            
            let firstElement = this.runtimeCmdStack[0];
            firstElement.stdout = stdout;
            firstElement.stderr = stdout;
        }
        else {
            this.lastLine = stdout;
        }
        
    }

}