// ============================================================================
// Void Protocol — Bootstrap
// ============================================================================
import { Game } from './game.js';
import { UI } from './ui.js';

const game = new Game();
const root = document.getElementById('app');
const ui = new UI(game, root);
ui.render();

// Expose for debugging in the browser console.
window.VP = { game, ui };
