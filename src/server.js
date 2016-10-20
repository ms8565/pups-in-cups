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
const pups = [];
let gameStart = true;
// let numPlayers = 0;

class Pup {

  constructor(x, y, xVelocity, yVelocity) {
    this.x = x;
    this.y = y;
    this.xVelocity = xVelocity;
    this.yVelocity = yVelocity;
  }
  update() {
    this.x += this.xVelocity;
    this.y += this.yVelocity;
  }
}

const updatePups = () => {
  /* for (let i = 0; i < pups.length; i++) {
    pups[i].update();
  }*/

  // I want to just use a for loop, but the test guide doesn't like unary operators
  // I'll use this uncomfortable while loop instead
  // To be investigated at a later time
  let i = 0;
  while (i < pups.length) {
    pups[i].update();
    i += 1;
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

   /* if (numPlayers = 1) {
      players[socket.id].color = 'orange';
    }
    else if (numPlayers = 2) {
      players[socket.id].color = 'pink';
    }
    else if (numPlayers = 3) {
      players[socket.id].color = 'yellow';
    }*/

    io.sockets.in('room1').emit('updateClientPlayers', { updatePlayers: players });

    if (gameStart) {
      initializeGame();
      gameStart = false;
    }
    // numPlayers += 1;
  });
};


const onDisconnect = (sock) => {
  const socket = sock;

  socket.on('disconnect', () => {
    socket.leave('room1');
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
