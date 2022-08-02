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

export {
    UnexpectedAmountError,
    ExistMessageError,
    InvalidTxStatusError,
    SmallFeeError
}