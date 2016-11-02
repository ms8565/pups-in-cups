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
  update(room) {
    let score = 0;
    let pupsMissed = 0;

    this.x += this.xVelocity;
    this.y += this.yVelocity;

    if (this.y >= 400) {
      for (var i in room.players) {
        if (this.isColliding(room.players[i])) {
          this.color = 'green';
          room.score += 20;
          io.sockets.in(room.name).emit('updateClientScore', { serverScore: room.score, serverMissed: room.pupsMissed });
          this.active = false;
        }
      }
      if (this.y >= 600) {
        room.pupsMissed += 1;
        io.sockets.in(room.name).emit('updateClientScore', { serverScore: room.score, serverMissed: room.pupsMissed });
        this.active = false;
      }
    }
  }
  isColliding(otherObj) {
    const distance = Math.sqrt(Math.pow((otherObj.x - this.x), 2) + Math.pow((otherObj.y - this.y), 2));
    return distance <= (this.radius + otherObj.radius);
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
  }
  addPlayer(socket, newPlayer) {
    const sock = socket;
    sock.join(this.name);
    this.players[sock.id] = newPlayer;

    const randomColor = Math.floor(Math.random() * this.availableColors.length);
    this.players[sock.id].color = this.availableColors.splice(Math.floor(Math.random() * this.availableColors.length), 1);

    sock.emit('assignPlayer', { player: this.players[sock.id] });
    io.sockets.in(this.name).emit('updateClientPlayers', { updatePlayers: this.players });

    if (this.gameStart) {
      this.initializeGame();
      this.gameStart = false;
    }
    this.numPlayers += 1;
      
    console.log("player added");
  }
  updatePlayer(socket, player) {
    const sock = socket;
    this.players[sock.id] = player;
    io.sockets.in(this.name).emit('updateClientPlayers', { updatePlayers: this.players });
    
  }
  removePlayer(socket) {
    const sock = socket;

    sock.leave(this.name);
    this.availableColors.push(this.players[sock.id].color);
    delete this.players[sock.id];
    this.numPlayers -= 1;
      
    //if(numPlayers <= 0){
    //    delete rooms[this.name];
    //}
  }
  initializeGame() {
    spawnPup(this);
    updatePups(this);
  }
  
}
updatePups = (room) => {
    room.pups = room.pups.filter(removeInactivePups, room.pups);

    for (let i = 0; i < room.pups.length; i += 1) {
      room.pups[i].update(room);
    }

    io.sockets.in(room.name).emit('updateClientPups', { updateCPups: room.pups });
    setTimeout(function() {updatePups(room);}, 30);
    
  }
  spawnPup = (room) => {
    room.pups.push(new Pup((Math.random() * 800), 0, 0, 5));
    
    setTimeout( function() {spawnPup(room);}, 3000);
  }


 const removeInactivePups = (value) =>{
    return value.active;
 };

/*const removeInactivePups = (value) =>{
    return value.active
 };*/


const initializeGame = () => {
  spawnPup();
  setInterval(spawnPup, 3000);
  setInterval(updatePups, 30);
};

const testRoom = new Room('room1');
rooms[testRoom.name] = testRoom;

const onJoined = (sock) => {
  const socket = sock;

  socket.on('join', (data) => {
    socket.roomName = data.roomName;
    rooms[data.roomName].addPlayer(socket, data.newPlayer);
  });
  socket.on('checkJoin', (data) => {
    if(data.roomName in rooms){
      //if(rooms[data.roomName].numPlayers <=4 ){
        socket.roomName = data.roomName;
        socket.emit('joinRoom', { roomName: data.roomName });
      //}
      else{
        socket.emit('denyRoom', { message: "Room is full" });
      }
    }
    else{
      socket.emit('denyRoom', { message: "Room does not exist" });
    }
    
  });
  socket.on('checkCreate', (data) => {
    if(!(data.roomName in rooms)){
      rooms[data.roomName] = new Room(data.roomName)
        
      socket.roomName = data.roomName;
      socket.emit('joinRoom', { roomName: data.roomName });
    }
    else{
      socket.emit('denyRoom', { message: "Room already exists" });
    }
  });
};


const onDisconnect = (sock) => {
  const socket = sock;

  socket.on('disconnect', () => {
    if(socket.roomName){
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
