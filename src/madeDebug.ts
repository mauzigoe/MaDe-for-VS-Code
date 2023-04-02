/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
/*
 * mockDebug.ts implements the Debug Adapter that "adapts" or translates the Debug Adapter Protocol (DAP) used by the client (e.g. VS Code)
 * into requests and events of the real "execution engine" or "debugger" (here: class MockRuntime).
 * When implementing your own debugger extension for VS Code, most of the work will go into the Debug Adapter.
 * Since the Debug Adapter is independent from VS Code, it can be used in any client (IDE) supporting the Debug Adapter Protocol.
 *
 * The most important class of the Debug Adapter is the MockDebugSession which implements many DAP requests by talking to the MockRuntime.
 */

import {
	Logger, logger,
	LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent,
	Thread, StackFrame, Source, Breakpoint,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { MaDeProcess, MatlabDebugProcessOptions } from './madeProcess';
import { MadeFrame} from './madeInfo';
import * as path from 'path';
import { defaultOnRejectHandler, defaultOnResolveHandler, defaultStdErrHandler, defaultStdOutHandler, evaluateOnResolveHandler, stackTraceOnRejectHandler, stackTraceOnResolveHandler, stackTraceStdOutHandler } from './outputHandler';

/**
 * This interface describes the mock-debug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the mock-debug extension.
 * The interface should always match this schema.
 */
interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	/** An absolute path to the "program" to debug. */
	program: string;
	/** Automatically stop target after launch. If not specified, target does not stop. */
	stopOnEntry?: boolean;
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
	/** run without debugging */
	noDebug?: boolean;
	/** if specified, results in a simulated compile error in launch. */
	compileError?: 'default' | 'show' | 'hide';
}

interface IAttachRequestArguments extends ILaunchRequestArguments { }

export class MatlabDebugSession extends LoggingDebugSession {

	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static threadID = 1;

	// a Mock runtime (or debugger)
	private _madeprocess: MaDeProcess;
	// matlab output channel
	//private _configurationDone = new Subject();

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor(command?: string , licensePath?: string) {
		super("made-debug.txt", true);

		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);

		let argsList: string[] = [];
		if (!command){
			command = '/usr/bin/env';
			argsList.push('matlab');
		}
		argsList.push('-nosplash', '-nodesktop', '-singleCompThread');
	
		if (licensePath){
			argsList.push('-c');
			argsList.push(licensePath);
		}
		
		let options : MatlabDebugProcessOptions = { 
			runtimeOption: {
				stdio: [ 'pipe', 'pipe', 'pipe']
			},
		};

		this._madeprocess = new MaDeProcess(command, argsList, options);

	}
	

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected async initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): Promise<void> {

		let ready = await this._madeprocess.enqueMatlabCmd(defaultStdOutHandler, defaultStdErrHandler, "\n").then(defaultOnResolveHandler,defaultOnRejectHandler);
		console.log(`ready: ${ready}`);

		if (!ready) {
			this.sendErrorResponse(response, {
				id: 1200,
				format: "Matlab could not be started. Check if path and/or license is specified correctly.",
				showUser: true, 
			});
			return;
		} 
		// build and return the capabilities of this debug adapter:
		response.body = response.body || {};

		if (!ready){
			response.success = false;	
		}

		await this._madeprocess.inhibitGuiForDebugMode();

		// the adapter implements the configurationDone request.
		response.body.supportsConfigurationDoneRequest = true;

		// make VS Code use 'evaluate' when hovering over source
		response.body.supportsEvaluateForHovers = false;

		// make VS Code show a 'step back' button
		response.body.supportsStepBack = false;

		// make VS Code support data breakpoints
		response.body.supportsDataBreakpoints = false;

		// make VS Code support completion in REPL
		response.body.supportsCompletionsRequest = false;
		//response.body.completionTriggerCharacters = [ ".", "[" ];

		// make VS Code send cancel request
		response.body.supportsCancelRequest = true;

		// make VS Code send the breakpointLocations request
		response.body.supportsBreakpointLocationsRequest = true;

		// make VS Code provide "Step in Target" functionality
		response.body.supportsStepInTargetsRequest = false;

		// make VS Code send exceptionInfo request
		response.body.supportsExceptionInfoRequest = true;

		// make VS Code send setVariable request
		response.body.supportsSetVariable = false;

		// make VS Code send setExpression request
		response.body.supportsSetExpression = false;

		response.body.supportsSingleThreadExecutionRequests = false;

		// make VS Code send disassemble request
		// make VS Code able to read and write variable memory
		response.body.supportsReadMemoryRequest = false;
		response.body.supportsWriteMemoryRequest = false;

		//response.body.supportSuspendDebuggee = false;
		response.body.supportTerminateDebuggee = false;
		response.body.supportsTerminateRequest = true;
		//response.body.supportsFunctionBreakpoints = false;

		this.sendResponse(response);

		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.
		this.sendEvent(new InitializedEvent());
	}

	/**
	 * Called at the end of the configuration sequence.
	 * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
	 */
	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
				
		super.configurationDoneRequest(response, args);
	}

	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
	}

	protected async attachRequest(response: DebugProtocol.AttachResponse, args: IAttachRequestArguments) {
		return this.launchRequest(response, args);
	}

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: ILaunchRequestArguments) {

		// make sure to 'Stop' the buffered logging if 'trace' is not set
		logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);	
		
		let ready = await this._madeprocess.enqueMatlabCmd(defaultStdOutHandler, defaultStdErrHandler, "\n").then(defaultOnResolveHandler,defaultOnRejectHandler);
		console.log(`launchRequest ready: ${ready}`);

		if (!ready) {
			this.sendErrorResponse(response, {
				id: 1200,
				format: "Matlab could not be started. Check if path and/or license is specified correctly.",
				showUser: true, 
			});
			return;
		} 

		let [cdProm, dbModeProm] = this._madeprocess.prepareDebugMode(args.program);
		await cdProm;
		await dbModeProm;

		//console.log("launchRequest:");
		//console.log(`isinDebugMode: ${isInDebugMode}`);
		await this._madeprocess.run(args.program);

		let isInDebugMode = await this._madeprocess.isInDebugMode();
		if (!isInDebugMode) {
			this.sendErrorResponse(response,{
				id: 1201,
				format: "launchRequest failed. Matlab Terminal not in Debug Mode",
				showUser: true
			});
			return;
		}

		let stop  = new StoppedEvent('defaultStop',MatlabDebugSession.threadID);
		this.sendEvent(stop);

		this.sendResponse(response);
	}

	protected setFunctionBreakPointsRequest(response: DebugProtocol.SetFunctionBreakpointsResponse, args: DebugProtocol.SetFunctionBreakpointsArguments, request?: DebugProtocol.Request): void {
		this.sendResponse(response);
	}

	protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
		
		// clear breakpoint

		// get bp lines
		const clientLines = args.lines || [];

		let writeCmd;

		let srcPath = args.source.path;
		
        if (!srcPath) {
            writeCmd = `dbclear all\n`;
        }
        else {
            writeCmd = `dbclear in ${srcPath}\n`;
        }

		await this._madeprocess
			.enqueMatlabCmd(defaultStdOutHandler,defaultStdErrHandler,writeCmd)
			.then(defaultOnResolveHandler,defaultOnRejectHandler)
			.then(
				() => {},
				() => {console.error(`${arguments.callee.name}: clearBreakpoints(${args.source.path}) failed`);}
			);

		// set and verify breakpoint locations
		let actualBreakpoints0 = clientLines.map(async cLine => {

			// what if args.source.path undefined?	
        	let writeCmd = `dbstop in ${args.source.path} at ${cLine}\n`;

			const [ verified, line, id ]: [boolean, number, number] = await this
				._madeprocess
				.enqueMatlabCmd(defaultStdOutHandler, defaultStdErrHandler,writeCmd)
				.then(defaultOnResolveHandler, defaultOnRejectHandler)
   		        .then(
             		(value)  => { 
                		return [value, cLine, this._madeprocess.bpId++];
              	  	}, 
                	(reason) => {
                	    return [false, cLine, this._madeprocess.bpId++];
                	}
            	);

			const bp = new Breakpoint(verified, this.convertDebuggerLineToClient(line)) as DebugProtocol.Breakpoint;
			bp.id = id;
			return bp;
		});

		
		const actualBreakpoints = await Promise.all<DebugProtocol.Breakpoint>(actualBreakpoints0);

		// send back the actual breakpoint positions
		response.body = {
			breakpoints: actualBreakpoints
		};

		this.sendResponse(response);
	}

	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
  
		let writeCmd = "dbstack('-completenames')\n";

		let madeFrames = (
				await this._madeprocess
				.enqueMatlabCmd(stackTraceStdOutHandler,defaultStdErrHandler,writeCmd)
				.then(stackTraceOnResolveHandler,stackTraceOnRejectHandler)
				.then((value:any)=>{return value;})
			);

		let stackFrames = madeFrames.map((value: MadeFrame, index: number) => {
			// rn, only the file currently debugged can be resolved by in the stack trace
			return new StackFrame(index,value.path, new Source(path.basename(value.path), value.path),value.line);
		});
		response.body = {
			stackFrames : stackFrames
		};

		
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		// runtime supports no threads so just return a default thread.
		response.body = {
			threads: [
				new Thread(MatlabDebugSession.threadID, `thread ${MatlabDebugSession.threadID}`),
			]
		};
		this.sendResponse(response);
	}

	/* Soon to come
	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): Promise<void> {
		this.sendResponse(response);
	}
	*/

	/* Also soon to come
	protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments): void {
		this.sendResponse(response);
	}
	*/
	
	protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): Promise<void> {

		let isInDebugMode: boolean = await this._madeprocess.isInDebugMode();
		
		if (isInDebugMode) {
			await this._madeprocess.dbcont();//.then((value: any) => { return value}, (reason: any) => this.onRejectHandler(reason,));
			isInDebugMode = await this._madeprocess.isInDebugMode();
		}
		
		if (!isInDebugMode){
			// don't know what to do exactly atm
			// possible:
			// 	- use MadeProcess.prepareDebugMode
			
			/*
			this.sendErrorResponse(response,{
				id: 1003,
				format: "Bug: Continue Request failed. Matlab Shell not in Debug Mode",
				showUser: true,
			});
			*/

			this.sendEvent(new TerminatedEvent(false));

			return;

		}
		
		this.sendEvent(new StoppedEvent('breakpoint',MatlabDebugSession.threadID));

		this.sendResponse(response);
	}

	protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): Promise<void> {

		let writeCmd = "dbstep\n";

        let successfulWriteCmd = await this._madeprocess.enqueMatlabCmd(defaultStdOutHandler,defaultStdErrHandler,writeCmd)
            .then(
                (value: any) => {
					this.sendEvent(new StoppedEvent('step', MatlabDebugSession.threadID));
					return true;
                },
				(value: any) => {
                	return false;
				}
            );

		if (successfulWriteCmd){
			this.sendResponse(response);
		}
		else {
			// Error handling needed
		}
	}

	/* Soon to come
	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
		//this._runtime.stepIn(args.targetId);
		this.sendResponse(response);
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
		//this._runtime.stepOut();
		this.sendResponse(response);
	}
	*/

	protected terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments, request?: DebugProtocol.Request | undefined): void {

		let success = this._madeprocess._runtime.kill();

		if (!success) {
			this.sendErrorResponse(
				response,
				{
					id: 1020,
					format: `could not kill matlab terminal (PID: ${this._madeprocess._runtime.pid ?? "ERR"})`
				}
			);
		}		
		else {
			this.sendResponse(response);
		}

		return;

	}

	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Promise<void> {

		let isRejected: boolean = false; 

        let writeCmd = `${args.expression}\n`;

        let result = await this._madeprocess.enqueMatlabCmd(defaultStdOutHandler, defaultStdErrHandler, writeCmd)
			.then(evaluateOnResolveHandler)
			.then(
				(value) => { 
					return value;
				},
				(value) => {
					isRejected = true; 
					return value;
				}
			);


		if (!isRejected) {
			response.body = {
				result: result,
				variablesReference: 0
			};
			this.sendResponse(response);
		}
		else {
			this.sendErrorResponse(response,{
				id: 1001,
				format: result,
				showUser: true
			});
			return ;
		}
	
	}

	private createSource(filePath: string): Source {
		return new Source(path.basename(filePath), this.convertDebuggerPathToClient(filePath), undefined, undefined, 'mock-adapter-data');
	}

}

		
