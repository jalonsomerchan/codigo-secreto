import { PALABRAS } from './palabras.js';
import { connect } from 'https://esm.sh/itty-sockets';

// Wrapper fino sobre itty-sockets para mantener la API de named events
class IttySockets {
  constructor(roomCode, userId) {
    this._userId = userId;
    this._listeners = {};
    this._socket = connect(roomCode);
    this._socket.on('message', (msg) => {
      if (!msg || !msg.event) return;
      if (msg.from === userId) return; // ignorar propios
      (this._listeners[msg.event] || []).forEach(cb => cb(msg.data));
    });
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  emit(event, data) {
    this._socket.send({ event, data, from: this._userId });
  }

  close() {
    this._socket.open(); // reconnect guard — itty-sockets no tiene close explícito
  }
}

class JuegoCodigoSecreto {
  constructor() {
    // GameAPI ya está en el scope global por el script en index.html
    this.api = new GameAPI();
    this.user = JSON.parse(localStorage.getItem('cs_user')) || null;
    this.room = null;
    this.socket = null;
    this.roomCode = null;
    this.isHost = false;
    this.role = 'agent';
    
    this.init();
  }

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.checkSession();
  }

  cacheDOM() {
    this.screens = {
      login: document.getElementById('screen-login'),
      lobby: document.getElementById('screen-lobby'),
      waiting: document.getElementById('screen-waiting'),
      game: document.getElementById('screen-game')
    };
    this.inputs = {
      username: document.getElementById('input-username'),
      roomCode: document.getElementById('input-room-code'),
      clueWord: document.getElementById('input-clue-word'),
      clueCount: document.getElementById('input-clue-count')
    };
    this.btns = {
      login: document.getElementById('btn-login'),
      createRoom: document.getElementById('btn-create-room'),
      joinRoom: document.getElementById('btn-join-room'),
      startGame: document.getElementById('btn-start-game'),
      sendClue: document.getElementById('btn-send-clue'),
      endTurn: document.getElementById('btn-end-turn'),
      backLobby: document.getElementById('btn-back-lobby'),
      logout: document.getElementById('btn-logout'),
      share: document.getElementById('btn-share')
    };
    this.displays = {
      roomCode: document.getElementById('display-room-code'),
      playerList: document.getElementById('list-players'),
      board: document.getElementById('board'),
      scoreRed: document.getElementById('score-red'),
      scoreBlue: document.getElementById('score-blue'),
      turnIndicator: document.getElementById('turn-indicator'),
      clueDisplay: document.getElementById('clue-display'),
      currentClue: document.getElementById('current-clue'),
      currentCount: document.getElementById('current-count'),
      modalResult: document.getElementById('modal-result'),
      username: document.getElementById('display-username')
    };
  }

  bindEvents() {
    this.btns.login.onclick = () => this.handleLogin();
    this.btns.createRoom.onclick = () => this.handleCreateRoom();
    this.btns.joinRoom.onclick = () => this.handleJoinRoom();
    this.btns.startGame.onclick = () => this.handleStartGame();
    this.btns.sendClue.onclick = () => this.handleSendClue();
    this.btns.endTurn.onclick = () => this.handleEndTurn();
    this.btns.backLobby.onclick = () => this.showScreen('lobby');
    this.btns.logout.onclick = () => this.handleLogout();
    this.btns.share.onclick = () => this.handleShare();
    document.getElementById('btn-copy-link').onclick = () => this.handleCopyLink();
  }

  handleCopyLink() {
    const url = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('btn-copy-link');
      const orig = btn.textContent;
      btn.textContent = '¡Copiado!';
      btn.classList.add('bg-green-700');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('bg-green-700'); }, 2000);
    });
  }

  handleLogout() {
    localStorage.removeItem('cs_user');
    this.user = null;
    this.displays.username.textContent = '---';
    this.showScreen('login');
  }

  handleShare() {
    const url = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
    if (navigator.share) {
      navigator.share({
        title: 'Únete a mi partida de Código Secreto',
        text: `Código de sala: ${this.roomCode}`,
        url: url
      });
    } else {
      navigator.clipboard.writeText(url);
      alert('Enlace copiado al portapapeles');
    }
  }

  checkSession() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');

    if (this.user) {
      this.displays.username.textContent = this.user.username;
      if (code) {
        this.inputs.roomCode.value = code;
        this.handleJoinRoom(code);
      } else {
        this.showScreen('lobby');
      }
    } else {
      if (code) this.inputs.roomCode.value = code;
      this.showScreen('login');
    }
  }

  async handleLogin() {
    const username = this.inputs.username.value.trim();
    if (!username) return alert('Introduce un nombre');
    
    try {
      const res = await this.api.createUser(username, '123456');
      const userId = res.user_id || res.id;
      if (!userId) throw new Error('No se recibió ID de usuario');

      this.user = { id: userId, username };
      localStorage.setItem('cs_user', JSON.stringify(this.user));
      this.displays.username.textContent = username;
      const pendingCode = this.inputs.roomCode.value.trim().toUpperCase();
      if (pendingCode) {
        this.handleJoinRoom(pendingCode);
      } else {
        this.showScreen('lobby');
      }
    } catch (err) {
      alert('Error al crear usuario: ' + err.message);
    }
  }

  async handleCreateRoom() {
    try {
      if (!this.user || !this.user.id) throw new Error('Usuario no autenticado');
      
      const room = await this.api.createRoom(
        16, 
        this.user.id, 
        { difficulty: 'normal' },
        { status: 'waiting', players: [] }
      );
      this.isHost = true;
      this.role = 'guia';
      this.enterRoom(room.room_code);
    } catch (err) {
      alert('Error al crear sala: ' + err.message);
    }
  }

  async handleJoinRoom(codeFromUrl) {
    const code = codeFromUrl || this.inputs.roomCode.value.trim().toUpperCase();
    if (!code) return alert('Introduce un código');
    
    try {
      const roomInfo = await this.api.joinRoom(code, this.user.id);
      this.isHost = roomInfo.host_id === this.user.id;
      this.role = this.isHost ? 'guia' : 'agent';
      this.enterRoom(code);
    } catch (err) {
      alert('No se pudo unir a la sala');
    }
  }

  async enterRoom(code) {
    this.roomCode = code;
    this.displays.roomCode.textContent = code;
    this.showScreen('waiting');
    this.generateQR(code);
    this.initSocket();
    await this.refreshRoom();
    this.socket.emit('player_joined', { userId: this.user.id, username: this.user.username });
    // Polling de respaldo por si IttySockets no releva el evento
    clearInterval(this._pollInterval);
    this._pollInterval = setInterval(() => {
      if (this.screens.waiting.classList.contains('active')) this.refreshRoom();
      else clearInterval(this._pollInterval);
    }, 3000);
  }

  generateQR(code) {
    const container = document.getElementById('qr-container');
    if (!container || typeof QRCode === 'undefined') return;
    container.innerHTML = '';
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    new QRCode(container, { text: url, width: 80, height: 80, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M });
  }

  async refreshRoom() {
    try {
      const room = await this.api.getRoom(this.roomCode);
      this.room = room;
      this.isHost = room.host_id === this.user.id;
      this.role = this.isHost ? 'guia' : 'agent';
      this.updateUI(room);
    } catch (err) {
      console.error('Error al refrescar sala');
    }
  }

  initSocket() {
    if (this.socket) this.socket.close();
    
    // IttySockets global por script en index.html
    this.socket = new IttySockets(this.roomCode, this.user.id);

    this.socket.on('player_joined', () => this.refreshRoom());
    this.socket.on('player_left', () => this.refreshRoom());
    
    this.socket.on('game_started', (data) => {
      this.room = data.room;
      this.startGame();
    });

    this.socket.on('word_reveal', (data) => {
      this.revealWordLocal(data.index, data.wordType);
      this.updateGameState(data.newState);
    });

    this.socket.on('clue_sent', (data) => {
      this.showClue(data.clue, data.count);
    });

    this.socket.on('turn_switch', (data) => {
      if (data.phase) {
        this.switchPhaseToClue();
        this.renderBoard();
        this.updateGameState(this.room.game_state);
      } else {
        this.switchTurnLocal(data.newTurn);
      }
    });
  }

  updateUI(room) {
    const players = room.players || room.participants || [];
    this.displays.playerList.innerHTML = players.map(p => `
      <li class="flex items-center gap-3 p-3 bg-gray-800 rounded-xl border border-gray-700">
        <div class="w-10 h-10 rounded-full bg-brand flex items-center justify-center font-bold text-sm">
          ${p.username ? p.username[0].toUpperCase() : '?'}
        </div>
        <div class="flex-1">
          <div class="font-bold text-sm">${p.username || 'Desconocido'} ${p.user_id === this.user.id ? '<span class="text-xs text-brand">(Tú)</span>' : ''}</div>
          <div class="text-[10px] text-gray-500 uppercase">${p.user_id === room.host_id ? 'Anfitrión' : 'Jugador'}</div>
        </div>
      </li>
    `).join('') || '<li class="text-gray-600 text-sm text-center py-4">Esperando jugadores...</li>';

    document.getElementById('admin-controls').classList.toggle('hidden', !this.isHost);
    document.getElementById('player-waiting-msg').classList.toggle('hidden', this.isHost);

    if (room.status === 'playing' && !this.screens.game.classList.contains('active')) {
      clearInterval(this._pollInterval);
      this.room = room;
      this.startGame();
    }
  }

  async handleStartGame() {
    const grid = this.generateGrid();
    const firstTurnEl = document.querySelector('input[name="first-turn"]:checked');
    const picked = firstTurnEl?.value ?? 'random';
    const firstTurn = picked === 'random' ? (Math.random() > 0.5 ? 'red' : 'blue') : picked;
    const timePerTurn = parseInt(document.getElementById('config-time')?.value) || 90;
    this.assignTypes(grid, firstTurn);

    const twoPlayerMode = document.getElementById('config-2player')?.checked || false;
    let spymasterId = null, playerRoles = null;
    const players = this.room.players || this.room.participants || [];

    if (twoPlayerMode) {
      const other = players.find(p => p.user_id !== this.user.id);
      spymasterId = Math.random() > 0.5 ? this.user.id : (other?.user_id || this.user.id);
      this.assignTypes2P(grid);
    } else {
      // Equipos y roles aleatorios
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const mid = Math.ceil(shuffled.length / 2);
      playerRoles = {};
      shuffled.forEach((p, i) => {
        const team = i < mid ? 'red' : 'blue';
        const isSpymaster = (i === 0) || (i === mid); // primero de cada equipo es guía
        playerRoles[p.user_id] = { team, role: isSpymaster ? 'guia' : 'agent' };
      });
    }
    const gameState = {
      grid,
      turn: firstTurn,
      score: { red: 0, blue: 0 },
      clue: null,
      timePerTurn,
      twoPlayerMode,
      spymasterId,
      playerRoles,
      phase: 'clue',
      status: 'playing'
    };

    try {
      await this.api.updateRoomState(this.roomCode, { status: 'playing', gameState });
    } catch (err) {
      alert('Error al iniciar: ' + err.message);
      return;
    }

    const updatedRoom = { ...this.room, game_state: gameState, status: 'playing' };
    this.socket.emit('game_started', { room: updatedRoom });

    // El host no recibe su propio emit, arrancamos directamente
    clearInterval(this._pollInterval);
    this.room = updatedRoom;
    this.startGame();
  }

  generateGrid() {
    const shuffled = [...PALABRAS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 25).map(word => ({
      word,
      type: 'civil',
      revealed: false
    }));
  }

  assignTypes2P(grid) {
    // Cooperativo: 9 palabras objetivo (red) + 15 civiles + 1 asesino
    const types = [
      ...Array(9).fill('red'),
      ...Array(15).fill('civil'),
      'assassin'
    ].sort(() => Math.random() - 0.5);
    grid.forEach((cell, i) => cell.type = types[i]);
  }

  assignTypes(grid, firstTurn) {
    const types = [];
    const secondTurn = firstTurn === 'red' ? 'blue' : 'red';
    for (let i = 0; i < 9; i++) types.push(firstTurn);
    for (let i = 0; i < 8; i++) types.push(secondTurn);
    for (let i = 0; i < 7; i++) types.push('civil');
    types.push('assassin');

    const shuffledTypes = types.sort(() => 0.5 - Math.random());
    grid.forEach((cell, i) => cell.type = shuffledTypes[i]);
  }

  startGame() {
    const state = this.room.game_state;
    // Asignar equipo y rol desde el estado
    if (!state.twoPlayerMode && state.playerRoles?.[this.user.id]) {
      const me = state.playerRoles[this.user.id];
      this._myTeam = me.team;
      this.role = me.role;
    }
    this.showScreen('game');
    this.renderBoard();
    this.updateGameState(state);
  }

  get myTeam() { return this._myTeam || (this.isHost ? 'red' : 'blue'); }

  renderBoard() {
    const state = this.room.game_state;
    this.displays.board.innerHTML = '';
    state.grid.forEach((cell, i) => {
      const btn = document.createElement('button');
      btn.className = `word-card rounded-lg p-2 flex items-center justify-center text-center font-bold uppercase transition-all shadow-md border-2 border-transparent bg-gray-800 hover:scale-[1.02] active:scale-95`;
      btn.textContent = cell.word;

      const isSpy2P = state.twoPlayerMode && state.spymasterId === this.user.id;
      const showAsGuide = state.twoPlayerMode
        ? (isSpy2P && cell.type === 'red')   // espía ve solo las palabras objetivo
        : this.role === 'guia';

      if (cell.revealed || showAsGuide) {
        this.applyCellColor(btn, cell.type, cell.revealed, !cell.revealed);
      }

      btn.onclick = () => this.handleCellClick(i);
      this.displays.board.appendChild(btn);
    });
  }

  applyCellColor(el, type, revealed, asHint = false) {
    const colors = {
      red:      'bg-red-600 text-white border-red-400',
      blue:     'bg-blue-600 text-white border-blue-400',
      civil:    'bg-yellow-100 text-gray-800 border-yellow-200',
      assassin: 'bg-black text-red-400 border-red-600',
    };
    if (type === 'assassin') el.textContent = '☠ ' + el.textContent.replace('☠ ', '');
    if (asHint) {
      el.classList.add('opacity-60', 'border-dashed');
      el.classList.add(...colors[type].split(' '));
    } else if (revealed) {
      el.classList.remove('bg-gray-800', 'text-white');
      el.classList.add(...colors[type].split(' '));
      el.classList.add('scale-95', 'opacity-90');
      el.disabled = true;
    }
  }

  updateGameState(state) {
    this.room.game_state = state;
    this.updateControls(); // updateControls maneja HUD según modo
  }

  updateControls() {
    const state = this.room.game_state;
    let showSpymaster, showAgent;

    if (state.twoPlayerMode) {
      const isSpy = state.spymasterId === this.user.id;
      showSpymaster = isSpy && state.phase === 'clue' && !state.clue;
      showAgent     = !isSpy && state.phase === 'guess';

      // HUD 2P
      document.getElementById('hud-2p').classList.remove('hidden');
      document.getElementById('hud-teams').classList.add('hidden');
      const myRole = isSpy ? 'ESPÍA' : 'AGENTE';
      document.getElementById('role-badge').textContent = myRole;
      document.getElementById('role-badge').className = `px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${isSpy ? 'border-brand bg-brand/20 text-brand-light' : 'border-green-600 bg-green-900/20 text-green-400'}`;
      const phaseText = state.phase === 'clue' ? 'ESPÍA · Dando pista' : 'AGENTE · Adivinando';
      document.getElementById('turn-indicator-2p').textContent = phaseText;
      const found = state.grid.filter(c => c.type === 'red' && c.revealed).length;
      document.getElementById('score-2p').textContent = found;
    } else {
      const isMyTurn = state.turn === this.myTeam;
      const isGuia = this.role === 'guia';
      showSpymaster = isGuia && isMyTurn && !state.clue;
      showAgent     = !isGuia && isMyTurn && !!state.clue;

      document.getElementById('hud-teams').classList.remove('hidden');
      document.getElementById('hud-2p').classList.add('hidden');
      this.displays.scoreRed.textContent = state.grid.filter(c => c.type === 'red' && c.revealed).length;
      this.displays.scoreBlue.textContent = state.grid.filter(c => c.type === 'blue' && c.revealed).length;
      this.displays.turnIndicator.textContent = state.turn.toUpperCase();
      this.displays.turnIndicator.className = `px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${state.turn === 'red' ? 'border-red-500 bg-red-900/30 text-red-400' : 'border-blue-500 bg-blue-900/30 text-blue-400'}`;
      const roleBadge = document.getElementById('my-role-display');
      const teamName = this.myTeam === 'red' ? 'ROJO' : 'AZUL';
      const roleName = this.role === 'guia' ? 'Guía' : 'Agente';
      roleBadge.textContent = `Tu rol: ${teamName} · ${roleName}`;
      roleBadge.className = `text-center text-xs font-bold px-2 py-1 rounded-lg ${this.myTeam === 'red' ? 'text-red-400' : 'text-blue-400'}`;
      roleBadge.classList.remove('hidden');
    }

    document.getElementById('spymaster-controls').classList.toggle('hidden', !showSpymaster);
    document.getElementById('agent-controls').classList.toggle('hidden', !showAgent);

    if (state.clue) {
      this.displays.clueDisplay.classList.remove('hidden');
      this.displays.currentClue.textContent = state.clue;
      const left = state.guessesLeft ?? state.count ?? 0;
      this.displays.currentCount.textContent = left;
      this.displays.currentCount.className = `rounded-lg px-2 py-0.5 text-sm font-bold ${left > 0 ? 'bg-gray-700' : 'bg-red-900 text-red-300'}`;
    } else {
      this.displays.clueDisplay.classList.add('hidden');
    }
  }

  async handleCellClick(index) {
    const state = this.room.game_state;
    const canGuess = state.twoPlayerMode
      ? (state.spymasterId !== this.user.id && state.phase === 'guess')
      : (this.role !== 'guia' && !!state.clue && state.turn === this.myTeam);
    if (!canGuess) return;

    const cell = state.grid[index];
    if (cell.revealed) return;
    cell.revealed = true;

    if (state.twoPlayerMode) {
      if (cell.type === 'assassin') {
        this.endGame('lose');
      } else if (cell.type === 'civil') {
        this.switchPhaseToClue();
      } else {
        state.guessesLeft = (state.guessesLeft ?? 1) - 1;
        if (state.guessesLeft <= 0) this.switchPhaseToClue();
      }
    } else {
      if (cell.type === 'assassin') {
        this.endGame(state.turn === 'red' ? 'blue' : 'red');
      } else if (cell.type !== state.turn) {
        this.switchTurn();
      } else {
        state.guessesLeft = (state.guessesLeft ?? 1) - 1;
        if (state.guessesLeft <= 0) this.switchTurn();
      }
    }

    this.checkWinCondition();
    this.saveState();
    
    this.socket.emit('word_reveal', {
      index,
      wordType: cell.type,
      newState: this.room.game_state
    });

    this.renderBoard();
    this.updateGameState(this.room.game_state);
  }

  handleSendClue() {
    const clue = this.inputs.clueWord.value.trim().toUpperCase();
    const count = parseInt(this.inputs.clueCount.value);
    if (!clue || isNaN(count)) return;

    this.room.game_state.clue = clue;
    this.room.game_state.count = count;
    this.room.game_state.guessesLeft = count;
    if (this.room.game_state.twoPlayerMode) this.room.game_state.phase = 'guess';
    this.inputs.clueWord.value = '';
    this.inputs.clueCount.value = '';
    this.saveState();
    this.socket.emit('clue_sent', { clue, count });
    this.renderBoard();
    this.updateGameState(this.room.game_state);
  }

  handleEndTurn() {
    if (this.room.game_state.twoPlayerMode) {
      this.switchPhaseToClue();
      this.saveState();
      this.socket.emit('turn_switch', { phase: 'clue' });
    } else {
      this.switchTurn();
      this.socket.emit('turn_switch', { newTurn: this.room.game_state.turn });
    }
    this.renderBoard();
    this.updateGameState(this.room.game_state);
  }

  switchPhaseToClue() {
    const s = this.room.game_state;
    s.clue = null; s.count = 0; s.guessesLeft = 0; s.phase = 'clue';
  }

  switchTurn() {
    this.room.game_state.turn = this.room.game_state.turn === 'red' ? 'blue' : 'red';
    this.room.game_state.clue = null;
    this.room.game_state.count = 0;
    this.room.game_state.guessesLeft = 0;
    this.room.game_state.phase = 'clue';
  }

  async saveState() {
    await this.api.updateRoomState(this.roomCode, { gameState: this.room.game_state });
  }

  checkWinCondition() {
    const state = this.room.game_state;
    if (state.twoPlayerMode) {
      const total = state.grid.filter(c => c.type === 'red').length;
      const found = state.grid.filter(c => c.type === 'red' && c.revealed).length;
      if (found === total) this.endGame('win');
    } else {
      const redTotal = state.grid.filter(c => c.type === 'red').length;
      const blueTotal = state.grid.filter(c => c.type === 'blue').length;
      if (state.grid.filter(c => c.type === 'red' && c.revealed).length === redTotal) this.endGame('red');
      if (state.grid.filter(c => c.type === 'blue' && c.revealed).length === blueTotal) this.endGame('blue');
    }
  }

  endGame(result) {
    const configs = {
      win:  { icon: '🎉', title: '¡VICTORIA!',      sub: 'Habéis encontrado todas las palabras.', cls: 'text-green-400' },
      lose: { icon: '💀', title: '¡GAME OVER!',     sub: 'El asesino ha sido descubierto.',       cls: 'text-red-500'   },
      red:  { icon: '🏆', title: '¡VICTORIA ROJA!', sub: 'El equipo rojo ha ganado.',              cls: 'text-red-500'   },
      blue: { icon: '🏆', title: '¡VICTORIA AZUL!', sub: 'El equipo azul ha ganado.',              cls: 'text-blue-500'  },
    };
    const c = configs[result] || configs.red;
    document.querySelector('#modal-result .text-5xl').textContent = c.icon;
    document.getElementById('winner-title').textContent = c.title;
    document.getElementById('winner-title').className = `text-3xl font-black mb-2 ${c.cls}`;
    document.getElementById('winner-subtitle').textContent = c.sub;
    this.displays.modalResult.classList.remove('hidden');
  }

  revealWordLocal(index, wordType) {
    if (this.room && this.room.game_state) {
      this.room.game_state.grid[index].revealed = true;
      this.renderBoard();
    }
  }

  showClue(clue, count) {
    if (this.room && this.room.game_state) {
      this.room.game_state.clue = clue;
      this.room.game_state.count = count;
      this.room.game_state.guessesLeft = count;
      if (this.room.game_state.twoPlayerMode) this.room.game_state.phase = 'guess';
      this.renderBoard();
      this.updateGameState(this.room.game_state);
    }
  }

  switchTurnLocal(newTurn) {
    if (this.room && this.room.game_state) {
      this.room.game_state.turn = newTurn;
      this.room.game_state.clue = null;
      this.room.game_state.count = 0;
      this.room.game_state.phase = 'clue';
      this.renderBoard();
      this.updateGameState(this.room.game_state);
    }
  }

  showScreen(screenId) {
    Object.values(this.screens).forEach(s => s.classList.remove('active'));
    this.screens[screenId].classList.add('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.game = new JuegoCodigoSecreto();
});
