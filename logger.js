import winston from 'winston';
import jsonStringify from "fast-safe-stringify";

const logLikeFormat = {
    transform(info) {
        const { timestamp, message } = info;
        const level = info[Symbol.for('level')];
        const args = info[Symbol.for('splat')];
        const strArgs = args ? args.map(jsonStringify).join(' ') : '';
        info[Symbol.for('message')] = `${timestamp} ${level}: ${message} ${strArgs}`;
        return info;
    }
};

const options = {
    file: {
        level: 'debug',
        filename: './logs/combined.log',
        handleExceptions: true,
        timestamp: true,
        json: false,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        colorize: false,
    },
    console: {
        level: 'debug',
        handleExceptions: true,
        timestamp: true,
        json: false,
        colorize: true,
    },
};

const logger = winston.createLogger({
    levels: winston.config.npm.levels,
    format: winston.format.combine(
        winston.format.timestamp(),
        logLikeFormat
    ),
    transports: [
        new winston.transports.Console(options.console),
        new winston.transports.File(options.file)
    ],
    exitOnError: true
})

module.exports = logger
