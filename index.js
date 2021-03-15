const express = require("express");
const app = express();
const server = require("http").Server(app);
const port = process.env.PORT || 3001;
const http = require('http').Server(app);
const io = require('socket.io')(server);
const cors = require("cors");

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname + "/build"));

const users = {}
let room;
let players;
let list_of_rooms = [];
// to store users of diffrent rooms
let list_of_users = {};
// list of users in specific room
let list_of_users_in_room = {}
// data coming from client
let movesArr = [];
let allData = [];
// storing scores of users
let scores = {};


io.on("connection", socket => {

    //CREATING ROOM
    socket.on("create_room", obj => {
        if ((list_of_rooms.includes(obj.room) === false)) {
            room = obj.room;
            players = obj.players;
            list_of_rooms.push(room);
            // initializing empty object of arr. i.e room to store users in room 
            if (list_of_users.hasOwnProperty(obj.room) === false) {
                list_of_users[room] = []
            }
            // if room's not registered already, store no of players joining
            if (list_of_users_in_room.hasOwnProperty(obj.room) === false) {
                list_of_users_in_room[room] = parseInt(obj.players);
            }
            socket.emit("room_created", { room, players });
        }
        else {
            room = null;
            socket.emit("room_created_error", { msg: "Can't Create Room. Maybe this name already exists" });
        }
    })

    //JOINING ROOM
    socket.on("join_room", obj => {
        let no_of_users_in_room = list_of_users_in_room[obj.room];
        if (list_of_rooms.includes(obj.room) === true) {
            if (list_of_users[obj.room].length < no_of_users_in_room) {
                if (list_of_users[obj.room].includes(obj.name) == false) {
                    socket.join(obj.room);
                    let clients = io.sockets.adapter.rooms.get(obj.room);
                    // there shouldn't be more than 7 users in one room
                    if (clients.size <= 13) {
                        // 13 instead of 7 bcoz we are adding user before so that we can get users in room (poor logic :( 
                        users[socket.id] = [obj.name, obj.room];
                        list_of_users[obj.room].push(obj.name);
                        socket.emit("room_joined", { joined: true });
                        // initilizing scores of joined user
                        scores[obj.name] = 0;
                    }
                    else {
                        socket.leave(obj.room);
                        socket.emit("room_joined_error", { msg: "Room seems to be full. You can join another room or create one." })
                    }
                }
                else {
                    socket.emit("room_joined_error", { msg: "Nickname seems to be already present in this room." })
                }
            }
            else {
                socket.emit("room_joined_error", { msg: "The room is full." })
            }
        }
        else socket.emit("room_joined_error", { msg: "This Room does not exist." });
    })

    // CHAT MESSAGE
    socket.on("join", room => {
        socket.join(room);
        io.to(room).emit("list_of_users", list_of_users[room]);
    });
    socket.on("chat-msg", data => {
        io.to(`${data.room}`).emit("chat-msg-send", { name: data.name, msg: data.msg })
    });


    //GAME
    socket.on("play", data => {
        allData.push(data);
        movesArr.push(data.moves);
        if (list_of_users_in_room[room] === movesArr.length) {
            let max = movesArr.sort((a, b) => b - a);
            let winner = allData.filter(obj => {
                if (obj.moves === max[0]) return obj;
            })
            winner = winner[0].name; //winner name
            // updating scores
            let score = scores[winner];
            score += 1;
            scores[winner] = score;
            // emptying arrays for another round
            movesArr = [];
            allData = [];
            io.to(data.room).emit("winner", { winner, score: scores[winner] });
        }
    });

    // SET ROUNDS
    socket.on("round", data => {
        io.to(data.room).emit("set_rounds", { round: data.round })
    });

    //GAME WINNER
    socket.on("winner", room => {
        let max_value_in_obj = Object.values(scores).sort((a, b) => b - a)[0];
        let index = Object.keys(scores).findIndex(key => scores[key] === max_value_in_obj)
        let name = Object.keys(scores)[index];
        io.to(room).emit("game_winner", { name, score: max_value_in_obj });
    });

    //LEAVE
    socket.on("disconnect", () => {
        let id = socket.id;
        let disconnected_user = Object.keys(users).filter(key => {
            if (key === id) return key
        });
        // to get id of disconnected user, checked due to rans twice. bug:(
        disconnected_user.length !== 0 ? disconnected_user = disconnected_user[0] : "";
        if (disconnected_user.length !== 0) {
            let room = users[disconnected_user][1];
            let uname = users[disconnected_user][0];
            // update players in room
            list_of_users_in_room[room] = list_of_users_in_room[room] - 1;
            // update players names in room
            let index = list_of_users[room].findIndex(name => name === uname);
            list_of_users[room].splice(index, 1);
            // delete scores
            delete scores[uname];
            delete users[socket.id];
            // leave room
            socket.leave(room);
            // delete room from all data types
            if (list_of_users_in_room[room] === 0) {
                let index_of_room = list_of_rooms.findIndex(r => r === room)
                list_of_rooms.splice(index_of_room, 1);
                delete list_of_users[room];
                delete list_of_users_in_room[room];
            }
            // send data to front end
            io.to(room).emit("disconnect_user", list_of_users[room])
        }
    })
})


server.listen(port, () => console.log("Runing", port));