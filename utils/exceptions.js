class UnexpectedAmountError extends Error {
    constructor(message) {
        super(message);
        this.name = "UnexpectedAmountError";
    }
}

class ExistMessageError extends Error {
    constructor(message) {
        super(message);
        this.name = "ExistMessageError";
    }
}

class InvalidTxStatusError extends Error {
    constructor(message) {
        super(message);
        this.name = "InvalidTxStatusError";
    }
}

class SmallFeeError extends Error {
    constructor(message) {
        super(message);
        this.name = "SmallFeeError";
    }
}

// the currency rate API is unavailable or returned an unexpected response
// (e.g. an HTML page of a rate limiter instead of JSON)
class CurrencyRateError extends Error {
    constructor(message) {
        super(message);
        this.name = "CurrencyRateError";
    }
}

export {
    UnexpectedAmountError,
    ExistMessageError,
    InvalidTxStatusError,
    SmallFeeError,
    CurrencyRateError
}