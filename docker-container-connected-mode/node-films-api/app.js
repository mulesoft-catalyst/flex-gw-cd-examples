var express = require("express");
var app = express();
app.get("/films", (req, res, next) => {
    res.json({ "films":[{"name": "The Shawshank Redemption", "releaseYear": 1994, "rating": 9.3}, {"name": "Interstellar", "releaseYear": 2014, "rating": 8.6}, {"name": "Gladiator", "releaseYear": 2000, "rating": 8.5}, {"name": "Dune", "releaseYear": 2021, "rating": 8.1}]});
   });
app.listen(3000, () => {
 console.log("Server running on port 3000");
});