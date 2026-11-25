// The engine in a dedicated worker: the page posts commands, the engine posts events back.
import { Engine } from './engine.js';

const engine = new Engine((event, transfer) => postMessage(event, transfer || []));
onmessage = (event) => engine.handle(event.data);
