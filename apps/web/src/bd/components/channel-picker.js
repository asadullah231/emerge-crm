"use client";
import { useState } from "react";

/** Start form: Hunting / Farming choice. Choosing Farming opens the signed-contract upload (PDF or Word), which is then required. */
export function ChannelPicker({ field }) {
  const [channel, setChannel] = useState("hunting");
  const farming = channel === "farming";
  return (
    <div className="space-y-3">
      <fieldset className="block text-sm">
        <legend className="font-medium">New lead or existing client?</legend>
        <label className="mt-2 flex items-start gap-2">
          <input
            name="channel"
            type="radio"
            value="hunting"
            checked={!farming}
            onChange={() => setChannel("hunting")}
            className="mt-0.5 h-4 w-4"
          />
          <span>Hunting: new lead</span>
        </label>
        <label className="mt-1.5 flex items-start gap-2">
          <input
            name="channel"
            type="radio"
            value="farming"
            checked={farming}
            onChange={() => setChannel("farming")}
            className="mt-0.5 h-4 w-4"
          />
          <span>Farming: existing client</span>
        </label>
        <span className="mt-1 block text-xs text-mute">
          Farming sends the approved-supplier email with the signed contract attached and does not
          block the company as an existing client.
        </span>
      </fieldset>
      {farming && (
        <label className="block rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
          <span className="font-medium">Signed contract with this client</span>
          <input
            name="contract"
            type="file"
            required
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className={field + " mt-1"}
          />
          <span className="mt-1 block text-xs text-mute">
            PDF or Word, up to 8 MB. It goes out as an attachment on every email of this campaign
            and on the first follow-up.
          </span>
        </label>
      )}
    </div>
  );
}
