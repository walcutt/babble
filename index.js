//Markov Bot

const END_OF_MESSAGE = null;

function sample(distribution) {
	if(distribution.length == 0) {
		return END_OF_MESSAGE;
	}

	var rand = Math.random();
	for(var i = 0; i < distribution.length; i++) {
		if(rand < distribution[i].upperbound) {
			return distribution[i].value;
		}
	}
	//If somehow slipped to end.... return highest value
	return distribution[distribution.length - 1].value;
}

function generateTextByWord(messageList) {

	var digest = generateDistributionTableByWord(messageList);

	var accumulator = "";

	var currentWord = sample(digest.startingDistribution);

	while(currentWord != END_OF_MESSAGE) {
		accumulator += " ";
		accumulator += currentWord;
		var distribution = digest.distributions[currentWord];
		currentWord = sample(distribution);
	}

	return accumulator;
}

function generateDistributionTableByWord(messageList) {

	var startingWordCounter = {};
	var midWordCounters = {};

	for(var i = 0; i < messageList.length; i++) {
		var text = messageList[i];
		var words = text.split(" ");
		if(words.length !== 0) {

			if(startingWordCounter[words[0]] === undefined) {
				startingWordCounter[words[0]] = 1;
			}
			startingWordCounter[words[0]]++;

			for(var j = 0; j < words.length; j++) {
				if(midWordCounters[words[j]] === undefined) {
					midWordCounters[words[j]] = {
						nextWords: {},
						ends: 0,
					};
				}
				if(j == words.length - 1) {
					midWordCounters[words[j]].ends++;
				} else {
					if(midWordCounters[words[j]].nextWords[words[j + 1]] === undefined) {
						midWordCounters[words[j]].nextWords[words[j + 1]] = 1;
					} else  {
						midWordCounters[words[j]].nextWords[words[j + 1]]++;
					}
				}
			}
		}
	}

	var digest = {
		startingDistribution: [],
		distributions: {},
	};

	var startingWords = Object.keys(startingWordCounter);
	var s_accum = 0;
	for(var i = 0; i < startingWords.length; i++) {
		s_accum += startingWordCounter[startingWords[i]];
		digest.startingDistribution.push({
			upperbound: s_accum,
			value: startingWords[i],
		});
	}
	for(var i = 0; i < digest.startingDistribution.length; i++) {
		digest.startingDistribution[i].upperbound /= s_accum;
	}

	var words = Object.keys(midWordCounters);
	for(var i = 0; i < words.length; i++) {
		digest.distributions[words[i]] = [];
		var nextWordList = Object.keys(midWordCounters[words[i]].nextWords);
		var accum = 0;
		for(var j = 0; j < nextWordList.length; j++) {
			accum += midWordCounters[words[i]].nextWords[nextWordList[j]];
			digest.distributions[words[i]].push({
				upperbound: accum,
				value: nextWordList[j],
			});
		}
		accum += midWordCounters[words[i]].ends;
		digest.distributions[words[i]].push({
			upperbound:accum,
			value: END_OF_MESSAGE,
		});
		for(var j = 0; j < digest.distributions[words[i]].length; j++) {
			digest.distributions[words[i]][j].upperbound /= accum;
		}
	}

	return digest;
}

require('dotenv').config();

const { Client, Intents } = require('discord.js');
let intents = new Intents();
intents.add(Intents.FLAGS.GUILDS);
intents.add(Intents.FLAGS.GUILD_MESSAGES);
const client = new Client({ intents: intents });

const command_word = "!babble";

client.on('ready', () => {
	console.log('works...');
});

client.on('messageCreate', (message) => {

	if(message.author === client.user) {
	    return;
	}

	if(message.content.trim().startsWith(command_word)) {
	    //send message
			handle_command(message);
	}
});


function handle_command(message) {

	console.log("handling: \"" + message.content + "\"");

	if(message.content === command_word + " help") {
		help();
	}

	var mentions = message.mentions;

	let user = mentions.users.first();
	if(user === undefined) {
		//Need to mention a user!
		return;
	}

	let channel = mentions.channels.find(c => c.isText()) || message.channel;

	message.channel.sendTyping();
	gatherSamples(user, channel, [], message, 0, message.channel);
}

const SAMPLE_GOAL = 1000;
const DEPTH_MAX = 50000;

function gatherSamples(user, channel, samples, beforeThisMessage, currentdepth, destchannel) {
	channel.messages.fetch({
		before: beforeThisMessage.id
	}).then(messages => {
		let relevantMessages = messages.filter(message => {
			return message.author.id === user.id && message.content.trim().charAt(0) !== '!';
		});
		let relevantContents = relevantMessages.map(
			m => m.cleanContent
		);
		samples.push(...relevantContents);
		// for(var i = 0; i < relevantMessages.length; i++) {
		// 	samples.push(relevantMessages[i].cleanContent);
		// }

		let messagesLength = messages.map(m => m).length;

		console.log(samples.length + " (" + (currentdepth + messagesLength) + ") (" + ((currentdepth + messagesLength) / 50) + ")");

		if(samples.length >= SAMPLE_GOAL) {
			sendMessage(samples, destchannel);
		} else {
			if(currentdepth < DEPTH_MAX && messagesLength > 0) {
				//Get earliest message in pool.
				let earliestMessage = messages.reduce(
					(currentEarliest, next) => next.createdTimestamp < currentEarliest.createdTimestamp ? next : currentEarliest,
					beforeThisMessage
				);
				// var earliestMessage = beforeThisMessage;
				// for(var i = 0; i < messages.array().length; i++) {
				// 	if(messages.array()[i].createdTimestamp < earliestMessage.createdTimestamp) {
				// 		earliestMessage = messages.array()[i];
				// 	}
				// }
				gatherSamples(user, channel, samples, earliestMessage, currentdepth + messagesLength, destchannel);
			} else {
				sendMessage(samples, destchannel);
			}
		}
	}).catch(err => {
		console.log("*******************");
		console.dir(err);
		console.log("*******************");

		if(samples.length > 0) {
			sendAndQuit(samples, destchannel);
		}
	});
}

function sendMessage(samples, destchannel) {
	var text = generateTextByWord(samples);
	while(text.split(" ").length < 1) {
		text = generateTextByWord(samples);
	}
	destchannel.send(text + "\n\n" + "[Message generated using " + samples.length + " samples.]");
}

function sendAndQuit(samples, destchannel) {
	var text = generateTextByWord(samples);
	while(text.split(" ").length < 1) {
		text = generateTextByWord(samples);
	}
	destchannel.send(text + "\n\n" + "[Message generated using " + samples.length + " samples.]").then(
		message => {
			process.exit(1);
		}
	);
}

function help() {

}

const bot_token = process.env.TOKEN;

client.login(bot_token);
