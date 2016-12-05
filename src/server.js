const http = require('http');
const fs = require('fs');
const socketio = require('socket.io');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

const index = fs.readFileSync(`${__dirname}/../client/index.html`);

const onRequest = (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.write(index);
  response.end();
};

const app = http.createServer(onRequest).listen(port);

console.log(`Listening on 127.0.0.1: ${port}`);

const io = socketio(app);

const rooms = {};
const highScores = [];

class Pup {

  constructor(x, y, xVelocity, yVelocity) {
    this.x = x;
    this.y = y;
    this.xVelocity = xVelocity;
    this.yVelocity = yVelocity;
    this.color = 'blue';
    this.radius = 20;
    this.active = true;
    this.yAccel = .2;
  }
  update(room) {
    this.yVelocity += this.yAccel;
    
    this.x += this.xVelocity;
    this.y += this.yVelocity;

    if (this.y >= 400) {
      const rPlayers = Object.keys(room.players);
      for (const i of rPlayers) {
        if (this.isColliding(room.players[i])) {
          this.color = 'green';

          room.setScore(room.score + 20);

          io.sockets.in(room.name).emit('updateClientScore', { serverScore: room.score, serverMissed: room.pupsMissed });
          this.active = false;
        }
      }
      if (this.y >= 600) {
        room.setPupsMissed(room.pupsMissed + 1);
          
        io.sockets.in(room.name).emit('updateClientScore', { serverScore: room.score, serverMissed: room.pupsMissed });
        this.active = false;
      }
    }
  }
  isColliding(otherObj) {
    const d1 = Math.pow((otherObj.x - this.x), 2);
    const d2 = Math.pow((otherObj.y - this.y), 2);
    const distance = Math.sqrt(d1 + d2);

    return distance <= (this.radius + otherObj.radius);
  }
}

const removeInactivePups = value => value.active;

function updatePups(room) {
  if (room.name in rooms) {
        // room.pups = room.pups.filter(removeInactivePups, room.pups);
        if(room.active){
        room.filterPups();

        for (let i = 0; i < room.pups.length; i += 1) {
          room.pups[i].update(room);
        }

        io.sockets.in(room.name).emit('updateClientPups', { updateCPups: room.pups });
        setTimeout(() => { updatePups(room); }, 30);
      }
  }
}

function spawnPup(room, spawnTime, yVelocity) {
  if (room.name in rooms) {
    room.pups.push(new Pup((Math.random() * 800), 0, 0, yVelocity));
    
    if(spawnTime <= 200){
        spawnTime = 200;
    }
    if(yVelocity >= 20){
        yVelocity = 20;
    }
      
    setTimeout(() => { spawnPup(room, spawnTime-100, yVelocity+.03); }, spawnTime);
  }
}

class Room {
  constructor(name) {
    this.name = name;
    this.players = {};
    this.pups = [];

    this.availableColors = ['yellow', 'red', 'orange', 'pink'];
    this.gameStart = true;
    this.numPlayers = 0;
    this.score = 0;
    this.pupsMissed = 0;
    this.active = true;
  }
  addPlayer(socket, newPlayer) {
    const sock = socket;
    sock.join(this.name);
    this.players[sock.id] = newPlayer;

    const randomColor = Math.floor(Math.random() * this.availableColors.length);
    this.players[sock.id].color = this.availableColors.splice(randomColor, 1);

    sock.emit('assignPlayer', { player: this.players[sock.id] });
    io.sockets.in(this.name).emit('updateClientPlayers', { updatePlayers: this.players });

    if (this.gameStart) {
      this.initializeGame();
      this.gameStart = false;
    }
    this.numPlayers += 1;

  }
  updatePlayer(socket, player) {
    if(this.active){
        const sock = socket;
        this.players[sock.id] = player;
        io.sockets.in(this.name).emit('updateClientPlayers', { updatePlayers: this.players });
    }
  }
  removePlayer(socket) {
    const sock = socket;

    sock.leave(this.name);
    this.availableColors.push(this.players[sock.id].color);
    delete this.players[sock.id];
    this.numPlayers -= 1;

    if (this.numPlayers <= 0) {
      delete rooms[this.name];
    }
  }
  initializeGame() {
    spawnPup(this, 3000, 3.5);
    updatePups(this);
  }
  filterPups() {
    this.pups = this.pups.filter(removeInactivePups, this.pups);
  }
  setScore(score) {
    this.score = score;
  }
  setPupsMissed(pupsMissed) {
    this.pupsMissed = pupsMissed;
    if(this.pupsMissed >= 10){
        this.active = false;
        this.postGame();
        
        //this.restartGame();
    }
  }
  restartGame(){
    this.pups = [];
    this.score = 0;
    this.pupsMissed = 0;
    this.active = true;
  }
  postGame(){
    const score = new Array(this.name, this.score);
    highScores.push(score);
    
    highScores.sort(function(a,b){
        if(a[1] === b[1]){
            return 0;
        }
        else{
            return (a[1] > b[1]) ? -1 : 1;
        }
    });
    
    if(highScores.length >= 10){
        highScores.pop();
    }
    
    console.log(highScores);
    io.sockets.in(this.name).emit('showScores', { scores: highScores });
  }
}


const testRoom = new Room('room1');
rooms[testRoom.name] = testRoom;

const onJoined = (sock) => {
  const socket = sock;

  socket.on('join', (data) => {
    socket.roomName = data.roomName;
    rooms[data.roomName].addPlayer(socket, data.newPlayer);
  });
  socket.on('checkJoin', (data) => {
    if (data.roomName in rooms) {
      console.log(rooms[data.roomName].numPlayers);
      if (rooms[data.roomName].numPlayers < 4) {
        socket.roomName = data.roomName;
        socket.emit('joinRoom', { roomName: data.roomName });
      } else {
        socket.emit('denyRoom', { message: 'Room is full' });
      }
    } else {
      socket.emit('denyRoom', { message: 'Room does not exist' });
    }
  });
  socket.on('checkCreate', (data) => {
    if (!(data.roomName in rooms)) {
      rooms[data.roomName] = new Room(data.roomName);

      socket.roomName = data.roomName;
      socket.emit('joinRoom', { roomName: data.roomName });
    } else {
      socket.emit('denyRoom', { message: 'Room already exists' });
    }
  });
};


const onDisconnect = (sock) => {
  const socket = sock;

  socket.on('disconnect', () => {
    if (socket.roomName) {
      rooms[socket.roomName].removePlayer(socket);
    }
  });
};

const onUpdate = (sock) => {
  const socket = sock;

  socket.on('updateServerPlayers', (data) => {
    rooms[socket.roomName].updatePlayer(socket, data.player);
  });
};

io.sockets.on('connection', (socket) => {
  onJoined(socket);
  onUpdate(socket);
  onDisconnect(socket);
});
