const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const users = new Map();

io.on('connection', (socket) => {
    socket.on('add-user', (name) => {
        users.set(socket.id, name);
        io.emit('update-users', Array.from(users.values()));
    });

    socket.on('user-message', (data) => {
        io.emit('broadcast', data);
    });

    socket.on('disconnect', () => {
        users.delete(socket.id);
        io.emit('update-users', Array.from(users.values()));
    });
});

app.use(express.static(path.resolve('./public')));

app.get('/', (req, res) => {
    return res.sendFile(path.resolve('./public/index.html'));
});

server.listen(3000, () => console.log('Server is On'));
