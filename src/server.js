 'use strict';
 
 const http = require('http');
 const fs = require('fs');
 const socketio = require('socket.io');

 const port = process.env.PORT || process.env.NODE_PORT || 3100;

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

 const pupTypes = ["shibe1","daschund1","corgi1"];

 class Pup {

   constructor(x, y, xVelocity, yVelocity) {
     this.x = x;
     this.y = y;
     this.xVelocity = xVelocity;
     this.yVelocity = yVelocity;
     this.color = 'blue';
     this.radius = 20;
     this.active = true;
     this.yAccel = 0.2;
     this.type = pupTypes[Math.floor(Math.random() * pupTypes.length)];//"shibe1";
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
             
           //room.players[i].caughtPup = this.type;
           io.sockets.in(room.name).emit('catchPup', { socketId: i, pupType: this.type });

           io.sockets.in(room.name).emit('updateClientScore', { serverScore: room.score, serverMissed: room.pupsMissed });
           this.active = false;
         }
       }
       if (this.y >= 700) {
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
     if (room.active) {
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
   let newSpawnTime = spawnTime;
   let newYVelocity = yVelocity;

   if (room.name in rooms) {
     if (room.active) {
       room.pups.push(new Pup((Math.random() * 900), 0, 0, newYVelocity));

       if (newSpawnTime <= 200) {
         newSpawnTime = 200;
       }
       if (newYVelocity >= 20) {
         newYVelocity = 20;
       }

       setTimeout(() => { spawnPup(room, newSpawnTime - 100, newYVelocity + 0.03); }, newSpawnTime);
     }
   }
 }

 class Room {
   constructor(name) {
     this.name = name;
     this.players = {};
     this.pups = [];

     this.availableTypes = [1, 2, 3, 4];
     this.gameStart = true;
     this.numPlayers = 0;
     this.score = 0;
     this.pupsMissed = 0;
     this.active = false;
     this.gameStart = true;
   }
   addPlayer(socket, newPlayer) {
     const sock = socket;
     sock.join(this.name);
     this.players[sock.id] = newPlayer;

     const randomType = Math.floor(Math.random() * this.availableTypes.length);
     this.players[sock.id].type = this.availableTypes.splice(randomType, 1);

     sock.emit('assignPlayer', { player: this.players[sock.id] });
     io.sockets.in(this.name).emit('updateClientPlayers', { updatePlayers: this.players });

     if (this.gameStart) {
       io.sockets.in(this.name).emit('showStartUI', null);
     }

     this.numPlayers += 1;
   }
   updatePlayer(socket, player) {
     if (this.active) {
       const sock = socket;
       this.players[sock.id] = player;
       io.sockets.in(this.name).emit('updateClientPlayers', { updatePlayers: this.players });
     }
   }
   removePlayer(socket) {
     const sock = socket;

     sock.leave(this.name);
     this.availableTypes.push(this.players[sock.id].type);
     delete this.players[sock.id];
     this.numPlayers -= 1;

     if (this.numPlayers <= 0) {
       delete rooms[this.name];
     }
   }
   initializeGame() {
     this.active = true;
     this.pups = [];
     this.score = 0;
     this.pupsMissed = 0;
     this.gameStart = false;

     io.sockets.in(this.name).emit('updateClientScore', { serverScore: this.score, serverMissed: this.pupsMissed });
     io.sockets.in(this.name).emit('hideUI', null);

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
     if (this.pupsMissed >= 10) {
       this.active = false;
       this.postGame();

        // this.restartGame();
     }
   }
   postGame() {
     const score = [this.name, this.score];
     highScores.push(score);

     highScores.sort((a, b) => {
       if (a[1] === b[1]) {
         return 0;
       }
       return (a[1] > b[1]) ? -1 : 1;
     });

     if (highScores.length >= 10) {
       highScores.pop();
     }

     io.sockets.in(this.name).emit('showEndUI', { scores: highScores });
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
   socket.on('startGame', () => {
     if (socket.roomName) {
       rooms[socket.roomName].initializeGame();
     }
   });
 };

 io.sockets.on('connection', (socket) => {
   onJoined(socket);
   onUpdate(socket);
   onDisconnect(socket);
 });
