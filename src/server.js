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

const players = {};
let pups = [];
const availableColors = ['yellow', 'red', 'orange', 'pink'];
let gameStart = true;
let numPlayers = 0;
let score = 0;
let pupsMissed = 0;

class Pup {

  constructor(x, y, xVelocity, yVelocity) {
    this.x = x;
    this.y = y;
    this.xVelocity = xVelocity;
    this.yVelocity = yVelocity;
    this.color = 'blue';
    this.radius = 20;
    this.active = true;
  }
  update(socket) {
    this.x += this.xVelocity;
    this.y += this.yVelocity;

    if (this.y >= 400) {
      for (var i in players) {
        if (this.isColliding(players[i])) {
          this.color = 'green';
          score += 20;
          io.sockets.in('room1').emit('updateClientScore', { serverScore: score, serverMissed: pupsMissed });
          this.active = false;
        }
      }
      if (this.y >= 600) {
        pupsMissed += 1;
        io.sockets.in('room1').emit('updateClientScore', { serverScore: score, serverMissed: pupsMissed });
        this.active = false;
      }
    }
  }
  isColliding(otherObj) {
    var distance = Math.sqrt(Math.pow((otherObj.x - this.x), 2) + Math.pow((otherObj.y - this.y), 2));
    return  distance <= (this.radius + otherObj.radius);
  }
}

const removeInactivePups = (value) => {
  return value.active;
};

const updatePups = () => {
  pups = pups.filter(removeInactivePups, pups);

  for (let i = 0; i < pups.length; i += 1) {
    pups[i].update();
  }

  io.sockets.in('room1').emit('updateClientPups', { updateCPups: pups });
};

const spawnPup = () => {
  pups.push(new Pup((Math.random() * 800), 0, 0, 5));
};

const initializeGame = () => {
  spawnPup();
  setInterval(spawnPup, 3000);
  setInterval(updatePups, 30);
};

const onJoined = (sock) => {
  const socket = sock;

  socket.on('join', (data) => {
    socket.join('room1');
    players[socket.id] = data.newPlayer;

    var randomColor = Math.floor(Math.random() * availableColors.length);
    players[socket.id].color = availableColors.splice(Math.floor(Math.random() * availableColors.length), 1);

    socket.emit('assignPlayer', { player: players[socket.id]});
    io.sockets.in('room1').emit('updateClientPlayers', { updatePlayers: players });

    if (gameStart) {
      initializeGame();
      gameStart = false;
    }
    numPlayers += 1;
  });
};


const onDisconnect = (sock) => {
  const socket = sock;

  socket.on('disconnect', () => {
    socket.leave('room1');
    availableColors.push(players[socket.id].color);
    delete players[socket.id];
    numPlayers -= 1;
  });
};

const onUpdate = (sock) => {
  const socket = sock;

  socket.on('updateServerPlayers', (data) => {
    players[socket.id] = data.player;
    io.sockets.in('room1').emit('updateClientPlayers', { updatePlayers: players });
  });
};

io.sockets.on('connection', (socket) => {
  onJoined(socket);
  onUpdate(socket);
  onDisconnect(socket);
});
