var Elo = require('arpad');
var csv = require('csv-parser');
var csvWriter = require('csv-write-stream');
var fs = require('graceful-fs');
var pairs = require('lodash.pairs');
var sortBy = require('lodash.sortby');
var forEachRight = require('lodash.foreachright');

var ALIASES = require('@csgo-elo/aliases');

var elo = new Elo();

var teams = {};
var changes = {};
var margins = {};

var correct = 0;
var matches = 0;

process.stdin
  .pipe(csv())
  .on('data', function(row) {
    if (ALIASES[row.team1]) {
      row.team1 = ALIASES[row.team1];
    }

    if (ALIASES[row.team2]) {
      row.team2 = ALIASES[row.team2];
    }

    // If either of these teams have not been seen yet, create entries for them.
    if (!teams[row.team1]) {
      teams[row.team1] = 1500;
      changes[row.team1] = [];
      margins[row.team1] = 0;
    }
    if (!teams[row.team2]) {
      teams[row.team2] = 1500;
      changes[row.team2] = [];
      margins[row.team2] = 0;
    }

    var team1rating = teams[row.team1];
    var team2rating = teams[row.team2];

    var result1 = parseInt(row.result1, 10);
    var result2 = parseInt(row.result2, 10);

    var winnerRating = team1rating;
    var loserRating = team2rating;
    if (result2 > result1) {
      winnerRating = team2rating;
      loserRating = team1rating;
    }

    // point differential (discounted when favorites win)
    var multi = Math.log(Math.abs(row.score1 - row.score2) + 1)
                * (2.2 / ((winnerRating - loserRating) * 0.001 + 2.2));

    elo.setKFactor(32 * multi);

    // calculate the expected scores of each team
    var team1odds = elo.expectedScore(team1rating, team2rating);
    var team2odds = elo.expectedScore(team2rating, team1rating);

    var team1new;
    var team2new;
    if (result1 > result2) {
      if (team1odds > team2odds) {
        correct++;
      }

      team1new = elo.newRating(team1odds, 1, team1rating);
      team2new = elo.newRating(team2odds, 0, team2rating);
    }
    else {
      if (team2odds > team1odds) {
        correct++;
      }

      team1new = elo.newRating(team1odds, 0, team1rating);
      team2new = elo.newRating(team2odds, 1, team2rating);
    }

    teams[row.team1] = team1new;
    teams[row.team2] = team2new;

    margins[row.team1] += row.score1 - row.score2;
    margins[row.team2] += row.score2 - row.score1;

    changes[row.team1].push([row.date, team1new, margins[row.team1]]);
    changes[row.team2].push([row.date, team2new, margins[row.team2]]);
    matches++;
  })
  .on('end', function() {
    console.log();

    var rankings = sortBy(pairs(teams), function(team) {
      return team[1];
    });

    var writer = csvWriter({
      headers: ['team', 'elo']
    });
    writer.pipe(fs.createWriteStream('standings.csv'));
    forEachRight(rankings, function(team, i) {
      console.log('%d. %s (%d)', rankings.length - i, team[0], team[1]);
      writer.write([team[0], team[1]]);
    });

    writer.end();

    Object.keys(changes).forEach(function(team) {
      writer = csvWriter({
        headers: ['date', 'elo', 'margin']
      });
      writer.pipe(fs.createWriteStream('teams/' + team + '.csv'));
      changes[team].forEach(function(row) {
        writer.write({date: +(new Date(row[0])), elo: row[1], margin: row[2]});
      });
      writer.end();
    });

    var success = 100 * correct / matches;
    console.log(success);
  });