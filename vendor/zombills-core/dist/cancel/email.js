import { cleanField, toWellFormedText } from "./clean-text.js";
const CURRENCY_CODE = /^[A-Z]{3}$/;
/** A switch, so a key such as "constructor" is not a cadence. */
function periodWord(cadence) {
    switch (cadence) {
        case "weekly":
            return "week";
        case "monthly":
            return "month";
        case "yearly":
            return "year";
        default:
            return null;
    }
}
function asRecord(value) {
    return typeof value === "object" && value !== null
        ? value
        : {};
}
/** Pure and total; reads exactly the five EmailInput properties. */
export function cancellationEmail(input) {
    const i = asRecord(input);
    const name = cleanField(i["serviceName"]);
    const amount = cleanField(i["amountText"]);
    const rawCurrency = i["currency"];
    const currency = typeof rawCurrency === "string" && CURRENCY_CODE.test(rawCurrency) ? rawCurrency : null;
    const what = name === "" ? "my subscription" : "my " + name + " subscription";
    const money = currency === null ? amount : amount + " (" + currency + ")";
    const period = periodWord(i["cadence"]);
    let amountLine;
    if (amount === "") {
        amountLine = null;
    }
    else if (i["cadenceAssumed"] === false && period !== null) {
        amountLine = "I am currently charged " + money + " every " + period + ".";
    }
    else {
        amountLine = "My most recent charge was " + money + ".";
    }
    const lines = [
        "Hello,",
        "",
        "Please cancel " + what + " and stop all future payments.",
        "",
        "Name on the account: [Your name]",
        "Account email: [Your account email]",
        "",
        ...(amountLine === null ? [] : [amountLine, ""]),
        "Please confirm in writing that the subscription is cancelled, the date it ends, and that no further payments will be taken.",
        "",
        "Thank you,",
        "[Your name]",
    ];
    return { subject: "Please cancel " + what, body: lines.join("\n") };
}
/** "mailto:?subject=…&body=…" with CRLF line breaks; never throws. */
export function mailtoHref(email) {
    const e = asRecord(email);
    const rawSubject = e["subject"];
    const rawBody = e["body"];
    const subject = toWellFormedText(typeof rawSubject === "string" ? rawSubject : "");
    const body = toWellFormedText(typeof rawBody === "string" ? rawBody : "").replaceAll("\n", "\r\n");
    return "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
}
