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
	ProgressStartEvent, ProgressUpdateEvent, ProgressEndEvent, InvalidatedEvent,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint, MemoryEvent, Response
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as base64 from 'base64-js';
import { ChildProcess, spawn, StdioPipe } from 'child_process';
import { read } from 'fs';
import { setFlagsFromString } from 'v8';
import { ConfigurationTarget, DebugProtocolBreakpoint, EnvironmentVariableMutatorType, OutputChannel, TreeItem } from 'vscode';
import { threadId } from 'worker_threads';
import { MaDeProcess, MatlabDebugProcessOptions } from './madeProcess'
import * as fs from 'fs';
import { DapEvent, MadeFrame, matlabDebugType, SetBreakpointResult } from './madeInfo';
import * as path from 'path';

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
	private outputChannel?: OutputChannel;

	//private _configurationDone = new Subject();

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor(outputChannel?: OutputChannel) {
		super("made-debug.txt");

		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);

		if (outputChannel){
			this.outputChannel = outputChannel;
		}

		let command = '/usr/bin/env';
		let argList = ['matlab', '-nosplash', '-nodesktop', '-singleCompThread'];
		let options : MatlabDebugProcessOptions = { 
			runtimeOption: {
				stdio: [ 'pipe', 'pipe', 'pipe']
			},
			outputChannel: this.outputChannel
		}

		this._madeprocess = new MaDeProcess(command, argList, options);

	}
	

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected async initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): Promise<void> {

		let ready = await this._madeprocess._runtime_ready.catch(() => {console.log("readiness not determinable"); return false})
		// build and return the capabilities of this debug adapter:
		response.body = response.body || {};

		if (!ready){
			response.success = false;	
		}

		await this._madeprocess.initializeOnlyShell()
		
		this._madeprocess._dap_event.on('stopOnBreakpoint',() => {
			this.sendEvent(new StoppedEvent('breakpoint', MatlabDebugSession.threadID));
		})

		this._madeprocess._dap_event.on('stopOnDataBreakpoint', () => {
			this.sendEvent(new StoppedEvent('data breakpoint'))
		})

		this._madeprocess._dap_event.on('stopOnInstructionBreakpoint', () => {
			this.sendEvent(new StoppedEvent('instruction breakpoint', MatlabDebugSession.threadID))
		})

		this._madeprocess._dap_event.on('stopOnStep', () => {
			this.sendEvent(new StoppedEvent('step', MatlabDebugSession.threadID))
		})

		this._madeprocess._dap_event.on('breakpointValidated', (verified,id) => {
			this.sendEvent(new BreakpointEvent('changed', { verified: verified, id: id}  as DebugProtocol.Breakpoint) )
		})


		this._madeprocess._dap_event.on('output', (type: any, text: any, filePath: any, line: any, column: any) => {

			let category: string;
			switch(type) {
				case 'prio': category = 'important'; break;
				case 'out': category = 'stdout'; break;
				case 'err': category = 'stderr'; break;
				default: category = 'console'; break;
			}
			const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`, category);

			if (text === 'start' || text === 'startCollapsed' || text === 'end') {
				e.body.group = text;
				e.body.output = `group-${text}\n`;
			}

			e.body.source = this.createSource(filePath);
			e.body.line = this.convertDebuggerLineToClient(line);
			e.body.column = this.convertDebuggerColumnToClient(column);
			this.sendEvent(e);
		});
		this._madeprocess._dap_event.on('end', () => {
			this.sendEvent(new TerminatedEvent());
		});
	
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

		this._madeprocess.setSourceFile(args.program)

		let ready = await this._madeprocess._runtime_ready

		if (!ready) {
			// simulate a compile/build error in "launch" request:
			// the error should not result in a modal dialog since 'showUser' is set to false.
			// A missing 'showUser' should result in a modal dialog.
			this.sendErrorResponse(response, {
				id: 1001,
				format: `compile error: some fake error.`,
				showUser: args.compileError === 'show' ? true : (args.compileError === 'hide' ? false : undefined)
			});
			return 
		} 

		let [cdProm, dbModeProm] = this._madeprocess.prepareDebugMode(args.program)
		await cdProm
		await dbModeProm

		await this._madeprocess.continue(args.program)
		let stop  = new StoppedEvent('defaultStop',MatlabDebugSession.threadID)
		this.sendEvent(stop)

		this.sendResponse(response);
	}

	protected setFunctionBreakPointsRequest(response: DebugProtocol.SetFunctionBreakpointsResponse, args: DebugProtocol.SetFunctionBreakpointsArguments, request?: DebugProtocol.Request): void {
		this.sendResponse(response);
	}

	protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
		
		const path = args.source.path as string;

		// clear breakpoint

		// get bp lines
		const clientLines = args.lines || [];
		await this._madeprocess.clearBreakpoints(args.source.path).then(
			() => {},
			() => {console.error(`${arguments.callee.name}: clearBreakpoints(${args.source.path}) failed`)}
		)

		// set and verify breakpoint locations

		let actualBreakpoints0 = clientLines.map(async l => {
			const [ verified, line, id ] = await this._madeprocess.setBreakpoints(args.source.path ?? "",l);
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
		let test = ((await this._madeprocess.stack().then((value:any)=>{return value})).map((value: MadeFrame, index: number) => {
			// rn, only the file currently debugged can be resolved by in the stack trace
			return new StackFrame(index,value.path, new Source(path.basename(value.path), value.path),value.line)
		}))
		response.body = {
			stackFrames : test
		};

		
		this.sendResponse(response)
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

		let continue_successful: boolean = await this._madeprocess.continue()//.then((value: any) => { return value}, (reason: any) => this.onRejectHandler(reason,));

		this.sendEvent(new StoppedEvent('breakpoint',MatlabDebugSession.threadID))

		this.sendResponse(response);
	}

	protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): Promise<void> {
		await this._madeprocess.next()
		this.sendEvent(new StoppedEvent('step',MatlabDebugSession.threadID))
		this.sendResponse(response);
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

	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Promise<void> {

		let isRejected: boolean = false; 

		let result = await this._madeprocess.evaluate(args.expression).then((value) => {return value}, (value) =>{ isRejected = true; return value })

		if (!isRejected) {
			response.body = {
				result: result,
				variablesReference: 0
			}
			this.sendResponse(response);
		}
		else {
			this.sendErrorResponse(response,1001);
			return 
		}
	
	}

	private createSource(filePath: string): Source {
		return new Source(path.basename(filePath), this.convertDebuggerPathToClient(filePath), undefined, undefined, 'mock-adapter-data');
	}

}

		
