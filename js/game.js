import { PALABRAS } from './palabras.js';
import GameAPI from './GameAPI.js';

class JuegoCodigoSecreto {
  constructor() {
    this.api = new GameAPI();
    this.user = JSON.parse(localStorage.getItem('cs_user')) || null;
    this.room = null;
    this.socket = null;
    this.roomCode = null;
    this.isHost = false;
    this.role = 'agent'; // 'guia' o 'agent'
    
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
  }

  handleLogout() {
    localStorage.removeItem('cs_user');
    this.user = null;
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
    if (this.user) {
      this.displays.username.textContent = this.user.username;
      this.showScreen('lobby');
    }
    
    // Check for room code in URL
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
      this.inputs.roomCode.value = code;
      if (this.user) this.handleJoinRoom(code);
    }
  }

  async handleLogin() {
    const username = this.inputs.username.value.trim();
    if (!username) return alert('Introduce un nombre');
    
    try {
      const res = await this.api.createUser(username, '123456');
      this.user = { id: res.user_id, username };
      localStorage.setItem('cs_user', JSON.stringify(this.user));
      this.displays.username.textContent = username;
      this.showScreen('lobby');
    } catch (err) {
      alert('Error al crear usuario');
    }
  }

  async handleCreateRoom() {
    try {
      // Usamos el ID de juego 16 (ajustar si es necesario)
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
      alert('Error al crear sala');
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
    this.connectSocket();
    this.refreshRoom();
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

  connectSocket() {
    const socketUrl = `wss://alon.one/juegos/api/socket?room=${this.roomCode}&user=${this.user.id}`;
    this.socket = new WebSocket(socketUrl);

    this.socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      this.handleSocketMessage(data);
    };

    this.socket.onclose = () => {
      console.log('Socket cerrado. Reintentando...');
      setTimeout(() => this.connectSocket(), 3000);
    };
  }

  handleSocketMessage(data) {
    switch (data.type) {
      case 'player_joined':
      case 'player_left':
        this.refreshRoom();
        break;
      case 'game_started':
        this.room = data.room;
        this.startGame();
        break;
      case 'word_reveal':
        this.revealWordLocal(data.index, data.wordType);
        this.updateGameState(data.newState);
        break;
      case 'clue_sent':
        this.showClue(data.clue, data.count);
        break;
      case 'turn_switch':
        this.switchTurnLocal(data.newTurn);
        break;
    }
  }

  updateUI(room) {
    this.displays.playerList.innerHTML = room.players.map(p => `
      <li class="flex items-center gap-3 p-3 bg-gray-800 rounded-xl border border-gray-700 animate-slide-up">
        <div class="w-10 h-10 rounded-full bg-brand flex items-center justify-center font-bold">
          ${p.username[0].toUpperCase()}
        </div>
        <div class="flex-1">
          <div class="font-bold">${p.username} ${p.user_id === this.user.id ? '<span class="text-xs text-brand">(Tú)</span>' : ''}</div>
          <div class="text-[10px] text-gray-500 uppercase">${p.user_id === room.host_id ? 'Anfitrión' : 'Jugador'}</div>
        </div>
      </li>
    `).join('');

    if (this.isHost) {
      document.getElementById('admin-controls').classList.remove('hidden');
      document.getElementById('player-waiting-msg').classList.add('hidden');
    } else {
      document.getElementById('admin-controls').classList.add('hidden');
      document.getElementById('player-waiting-msg').classList.remove('hidden');
    }

    if (room.status === 'playing' && this.screens.game.style.display !== 'flex') {
      this.room = room;
      this.startGame();
    }
  }

  async handleStartGame() {
    const grid = this.generateGrid();
    const firstTurn = Math.random() > 0.5 ? 'red' : 'blue';
    this.assignTypes(grid, firstTurn);

    const gameState = {
      grid,
      turn: firstTurn,
      score: { red: 0, blue: 0 },
      clue: null,
      status: 'playing'
    };

    await this.api.updateRoomState(this.roomCode, { 
      status: 'playing',
      gameState 
    });

    this.socket.send(JSON.stringify({ type: 'start_game', room: { ...this.room, game_state: gameState, status: 'playing' } }));
  }

  generateGrid() {
    const shuffled = [...PALABRAS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 25).map(word => ({
      word,
      type: 'civil',
      revealed: false
    }));
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
    this.showScreen('game');
    this.renderBoard();
    this.updateGameState(this.room.game_state);
  }

  renderBoard() {
    this.displays.board.innerHTML = '';
    this.room.game_state.grid.forEach((cell, i) => {
      const btn = document.createElement('button');
      btn.className = `h-20 sm:h-24 rounded-lg p-2 flex items-center justify-center text-center text-[10px] sm:text-xs font-bold uppercase transition-all shadow-md border-2 border-transparent bg-gray-800 hover:scale-[1.02] active:scale-95`;
      btn.textContent = cell.word;
      
      if (cell.revealed || this.role === 'guia') {
        this.applyCellColor(btn, cell.type, cell.revealed);
      }

      btn.onclick = () => this.handleCellClick(i);
      this.displays.board.appendChild(btn);
    });
  }

  applyCellColor(el, type, revealed) {
    const colors = {
      red: 'bg-red-600 text-white border-red-400',
      blue: 'bg-blue-600 text-white border-blue-400',
      civil: 'bg-yellow-100 text-gray-800 border-yellow-200',
      assassin: 'bg-gray-900 text-white border-red-900'
    };

    if (this.role === 'guia' && !revealed) {
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
    this.displays.scoreRed.textContent = state.grid.filter(c => c.type === 'red' && c.revealed).length;
    this.displays.scoreBlue.textContent = state.grid.filter(c => c.type === 'blue' && c.revealed).length;
    
    this.displays.turnIndicator.textContent = `TURNO ${state.turn.toUpperCase()}`;
    this.displays.turnIndicator.className = `px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${state.turn === 'red' ? 'border-red-500 bg-red-900/30 text-red-400' : 'border-blue-500 bg-blue-900/30 text-blue-400'}`;

    this.updateControls();
  }

  updateControls() {
    const state = this.room.game_state;
    const isGuia = this.role === 'guia';
    const isMyTurn = state.turn === (this.isHost ? 'red' : 'blue'); 
    
    document.getElementById('spymaster-controls').classList.toggle('hidden', !isGuia || !isMyTurn || state.clue);
    document.getElementById('agent-controls').classList.toggle('hidden', isGuia || !isMyTurn || !state.clue);
    
    if (state.clue) {
      this.displays.clueDisplay.classList.remove('hidden');
      this.displays.currentClue.textContent = state.clue;
      this.displays.currentCount.textContent = state.count;
    } else {
      this.displays.clueDisplay.classList.add('hidden');
    }
  }

  async handleCellClick(index) {
    if (this.role === 'guia') return; 
    const state = this.room.game_state;
    if (!state.clue) return alert('Espera a la pista de tu Guía');
    
    const cell = state.grid[index];
    if (cell.revealed) return;

    cell.revealed = true;
    
    if (cell.type === 'assassin') {
      this.endGame(state.turn === 'red' ? 'blue' : 'red');
    } else if (cell.type !== state.turn) {
      this.switchTurn();
    }
    
    this.checkWinCondition();
    this.saveState();
    
    this.socket.send(JSON.stringify({
      type: 'word_reveal',
      index,
      wordType: cell.type,
      newState: this.room.game_state
    }));

    this.renderBoard();
    this.updateGameState(this.room.game_state);
  }

  handleSendClue() {
    const clue = this.inputs.clueWord.value.trim().toUpperCase();
    const count = parseInt(this.inputs.clueCount.value);
    if (!clue || isNaN(count)) return;

    this.room.game_state.clue = clue;
    this.room.game_state.count = count;
    this.saveState();

    this.socket.send(JSON.stringify({ type: 'clue_sent', clue, count }));
    this.updateGameState(this.room.game_state);
  }

  handleEndTurn() {
    this.switchTurn();
    this.socket.send(JSON.stringify({ type: 'turn_switch', newTurn: this.room.game_state.turn }));
    this.updateGameState(this.room.game_state);
  }

  switchTurn() {
    this.room.game_state.turn = this.room.game_state.turn === 'red' ? 'blue' : 'red';
    this.room.game_state.clue = null;
    this.room.game_state.count = 0;
  }

  async saveState() {
    await this.api.updateRoomState(this.roomCode, { gameState: this.room.game_state });
  }

  checkWinCondition() {
    const state = this.room.game_state;
    const redTotal = state.grid.filter(c => c.type === 'red').length;
    const blueTotal = state.grid.filter(c => c.type === 'blue').length;
    const redFound = state.grid.filter(c => c.type === 'red' && c.revealed).length;
    const blueFound = state.grid.filter(c => c.type === 'blue' && c.revealed).length;

    if (redFound === redTotal) this.endGame('red');
    if (blueFound === blueTotal) this.endGame('blue');
  }

  endGame(winner) {
    const title = winner === 'red' ? '¡VICTORIA ROJA!' : '¡VICTORIA AZUL!';
    document.getElementById('winner-title').textContent = title;
    document.getElementById('winner-title').className = `text-3xl font-black mb-2 ${winner === 'red' ? 'text-red-500' : 'text-blue-500'}`;
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
      this.updateGameState(this.room.game_state);
    }
  }

  switchTurnLocal(newTurn) {
    if (this.room && this.room.game_state) {
      this.room.game_state.turn = newTurn;
      this.room.game_state.clue = null;
      this.room.game_state.count = 0;
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
