var services = require('../services')
, _ = require('underscore')
, fs = require('fs')
, path = require('path')
, debug = require('debug')('joggy:kitten')
, symbols = require('../../../assets/media/kitty/symbols.json')
, duration = 15 * 1000
, rewardCredits = 10

function Kitty() {
    services.on('addClient', this.addClient.bind(this))
    services.on('removeClient', this.removeClient.bind(this))

    this.clientAnswerListeners = {}
}

Kitty.prototype.startCompetition = function(cb) {
    this.competitionCallback = cb
    this.start()
}

Kitty.prototype.addClient = function(client) {
    debug('adding client ' + client.socket.id)

    var listener = this.clientAnswerListeners[client.socket.id] = this.clientAnswer.bind(this, client)
    client.socket.on('kitty', listener)
}

Kitty.prototype.removeClient = function(client) {
    debug('removing client ' + client.socket.id)
    client.socket.removeListener('kitty', this.clientAnswerListeners[client.socket.id]);
    delete this.clientAnswerListeners[client.socket.id]
}

Kitty.prototype.clientAnswer = function(client, packet) {
    debug('processing client answer ' + JSON.stringify(packet))
    if (!_.isNumber(packet.answer)) return console.error('unexpected answer')

    var answer = +packet.answer
    if (!~[0, 1, 2].indexOf(answer)) return console.error('unexpected answer number')

    var time = +packet.time
    if (time % 1 !== 0) return console.error('unexpected time(fraction)')
    if (time < 0) return console.error('unexpected time (<0)')
    if (time > 1000) return console.error('unexped time (>1000)')

    if (!client.user) return console.error('client is not logged in')
    if (client.user.model.get('noBonus')) return

    if (!this.answers) {
        client.socket.emit('error', 'your time was not registered because it came in very late')
        return
    }

    if (this.answers[client.user.model.id]) return console.error('duplicate answer')

    this.answers[client.user.model.id] = {
        time: time,
        answer: answer,
        user: client.user
    }

    services.emit('kittyAnswer', { user: client.user, time: time, correct: answer === this.answer })
}

Kitty.prototype.start = function() {
    this.answers = {}

    var alternatives = []


    // pick 3 alternative symbols
    for (var i = 0; i < 3; i++) {
        while (true) {
            var pick = Math.floor(Math.random() * _.keys(symbols).length)
            if (~alternatives.indexOf(pick)) continue
            alternatives.push(pick)
            break
        }
    }

    debug('alternatives are ' + alternatives.map(function(a) { return _.keys(symbols)[a] }).join())

    this.answer = Math.floor(Math.random() * alternatives.length)

    var answer = alternatives[this.answer]

    debug('answer is ' + answer + ' (' + _.keys(symbols)[answer] + ')')
    debug('answer index is ' + this.answer)

    // choose a hint for the answer
    var hints = symbols[answer].filename.match(/[^\.]+/)[0].split('-')
    , hint = hints[Math.floor(Math.random() * hints.length)]

    debug('hints are ' + hints.join())
    debug('chose hint ' + hint)

    var alternativesPos = alternatives.map(function(ai) {
        return _.pick(symbols[ai], 'x', 'y')
    })

    debug('hint: ' + hint)
    debug('alternative pos ' + JSON.stringify(alternativesPos))

    services.site.clients.forEach(function(client) {
        if (client.user && client.user.model.get('noBonus')) return

        client.socket.emit('kitty', {
            hint: hint,
            alternatives: alternativesPos
        })
    })

    services.emit('kittyStart', {})

    setTimeout(this.stop.bind(this), duration)
}

Kitty.prototype.stop = function() {
    var self = this

    debug('time is up!')

    var winner = null
    , time = null

    _.each(self.answers, function(v, userId) {
        if (v.answer !== self.answer) return
        if (time !== null && v.time >= time) return
        if (v.time === 0) return
        time = v.time
        winner = v.user
        debug('new best time, ' + time + ' by ' + v.user.model.id)
    }, self)

    this.answer = null
    this.answers = null

    if (winner) {
        winner.bonus(rewardCredits * 1e5, rewardCredits * 1e5 * 10, 'contest reward', function(err) {
            if (err) console.error('failed to give bonus from quiz', err)
            services.emit('competitionWon', { user: winner, credits: 10, what: 'Kitty with the time ' + time })
        })
    } else {
        debug('no winner')
    }

    this.competitionCallback()
    this.competitionCallback = null
}

module.exports = Kitty
