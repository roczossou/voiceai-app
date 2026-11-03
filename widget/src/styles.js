// CSS injecté dans le Shadow DOM → isolé de la page hôte (aucune fuite de/vers
// les styles du site client). La couleur primaire vit dans --vai-primary,
// posée sur l'élément hôte et mise à jour quand la config de l'agent arrive.
export const css = `
:host { all: initial; --vai-primary: #2563eb; }
* { box-sizing: border-box; margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }

.launcher {
  position: fixed; bottom: 20px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--vai-primary); color: #fff; box-shadow: 0 6px 24px rgba(0,0,0,.25);
  display: grid; place-items: center; transition: transform .15s ease;
}
.launcher:hover { transform: scale(1.06); }
.launcher svg { width: 26px; height: 26px; }

.panel {
  position: fixed; bottom: 88px; z-index: 2147483000;
  width: 370px; max-width: calc(100vw - 32px); height: 560px; max-height: calc(100vh - 120px);
  background: #fff; border-radius: 16px; overflow: hidden;
  box-shadow: 0 12px 48px rgba(0,0,0,.28); display: flex; flex-direction: column;
  animation: pop .18s ease;
}
@keyframes pop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.pos-right { right: 20px; }
.pos-left  { left: 20px; }

.header { background: var(--vai-primary); color: #fff; padding: 14px 16px; display: flex; align-items: center; gap: 10px; }
.header .avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,.25); display: grid; place-items: center; font-weight: 600; overflow: hidden; }
.header .avatar img { width: 100%; height: 100%; object-fit: cover; }
.header .title { font-weight: 600; font-size: 15px; flex: 1; }
.header .close { background: none; border: none; color: #fff; cursor: pointer; font-size: 20px; line-height: 1; opacity: .85; }
.header .close:hover { opacity: 1; }

.messages { flex: 1; overflow-y: auto; padding: 16px; background: #f7f8fa; display: flex; flex-direction: column; gap: 10px; }
.msg { max-width: 82%; padding: 10px 13px; border-radius: 14px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
.msg.user { align-self: flex-end; background: var(--vai-primary); color: #fff; border-bottom-right-radius: 4px; }
.msg.assistant { align-self: flex-start; background: #fff; color: #1a1a1a; border: 1px solid #e6e8eb; border-bottom-left-radius: 4px; }
.msg.error { align-self: center; background: #fee2e2; color: #991b1b; font-size: 13px; }

.typing { display: inline-flex; gap: 4px; align-items: center; }
.typing span { width: 7px; height: 7px; border-radius: 50%; background: #b0b6be; animation: blink 1.2s infinite; }
.typing span:nth-child(2) { animation-delay: .2s; }
.typing span:nth-child(3) { animation-delay: .4s; }
@keyframes blink { 0%, 60%, 100% { opacity: .3; } 30% { opacity: 1; } }

.composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e6e8eb; background: #fff; }
.composer textarea { flex: 1; resize: none; border: 1px solid #d5d8dc; border-radius: 10px; padding: 9px 11px; font-size: 14px; max-height: 100px; outline: none; }
.composer textarea:focus { border-color: var(--vai-primary); }
.composer button { border: none; background: var(--vai-primary); color: #fff; border-radius: 10px; width: 40px; cursor: pointer; display: grid; place-items: center; }
.composer button:disabled { opacity: .5; cursor: default; }
.composer button svg { width: 18px; height: 18px; }
.composer button.mic { background: #fff; color: var(--vai-primary); border: 1px solid #d5d8dc; }
.composer button.mic.live-on { background: #ef4444; border-color: #ef4444; color: #fff; animation: vai-pulse 1.2s infinite; }
@keyframes vai-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.4) } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0) } }
`
