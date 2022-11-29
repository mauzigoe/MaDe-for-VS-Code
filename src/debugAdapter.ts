import { MatlabDebugSession } from './madeDebug';
// start a single session that communicates via stdin/stdout
const session = new MatlabDebugSession();
process.on('SIGTERM', () => {
    session.shutdown();
});