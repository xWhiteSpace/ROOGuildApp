/**
 * ⏳ GUILD REGISTRATION TIME MATRIX SYSTEM (GMT+9 / JST)
 * Explicitly states current session status and next opening tracks.
 */
export function getGateStatusDetails() {
  // Grab system clock time and normalize it to a true JST zone profile string
  const jstString = new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
  const jstDate = new Date(jstString);

  const dayOfWeek = jstDate.getDay(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, ...
  const hours = jstDate.getHours();
  const minutes = jstDate.getMinutes();
  
  // Convert current daily clock time to absolute minutes
  const currentMinutesOffset = hours * 60 + minutes;
  const cutoffMinutesOffset = 23 * 60 + 15; // 23:15 Threshold Marks

  let isGateOpen = false;
  let currentSessionLabel = "";
  let nextStatusChangeMessage = "";

  switch (dayOfWeek) {
    case 0: // SUNDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = false;
        currentSessionLabel = "Sunday Raid Session";
        nextStatusChangeMessage = "Bidding for tonight's Sunday raid is CLOSED. Registration for Tuesday's event opens tonight at 23:15 JST.";
      } else {
        isGateOpen = true;
        currentSessionLabel = "Tuesday Registration Period";
        nextStatusChangeMessage = "Registration is OPEN for Tuesday's raid. Submissions close Monday night at 23:15 JST.";
      }
      break;

    case 1: // MONDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = true;
        currentSessionLabel = "Tuesday Registration Period";
        nextStatusChangeMessage = "Registration is OPEN for Tuesday's raid. Submissions close tonight at 23:15 JST.";
      } else {
        isGateOpen = false;
        currentSessionLabel = "Tuesday Raid Session";
        nextStatusChangeMessage = "Bidding for Tuesday's raid is CLOSED. Registration for Thursday's event opens Tuesday night at 23:15 JST.";
      }
      break;

    case 2: // TUESDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = false;
        currentSessionLabel = "Tuesday Raid Session";
        nextStatusChangeMessage = "Bidding for tonight's Tuesday raid is CLOSED. Registration for Thursday's event opens tonight at 23:15 JST.";
      } else {
        isGateOpen = true;
        currentSessionLabel = "Thursday Registration Period";
        nextStatusChangeMessage = "Registration is OPEN for Thursday's raid. Submissions close Wednesday night at 23:15 JST.";
      }
      break;

    case 3: // WEDNESDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = true;
        currentSessionLabel = "Thursday Registration Period";
        nextStatusChangeMessage = "Registration is OPEN for Thursday's raid. Submissions close tonight at 23:15 JST.";
      } else {
        isGateOpen = false;
        currentSessionLabel = "Thursday Raid Session";
        nextStatusChangeMessage = "Bidding for Thursday's raid is CLOSED. Registration for Sunday's event opens Thursday night at 23:15 JST.";
      }
      break;

    case 4: // THURSDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = false;
        currentSessionLabel = "Thursday Raid Session";
        nextStatusChangeMessage = "Bidding for tonight's Thursday raid is CLOSED. Registration for Sunday's event opens tonight at 23:15 JST.";
      } else {
        isGateOpen = true;
        currentSessionLabel = "Sunday Registration Period";
        nextStatusChangeMessage = "Registration is OPEN for Sunday's raid. Submissions close Saturday night at 23:15 JST.";
      }
      break;

    case 5: // FRIDAY
      isGateOpen = true;
      currentSessionLabel = "Sunday Registration Period";
      nextStatusChangeMessage = "Registration is OPEN for Sunday's raid. Submissions close Saturday night at 23:15 JST.";
      break;

    case 6: // SATURDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = true;
        currentSessionLabel = "Sunday Registration Period";
        nextStatusChangeMessage = "Registration is OPEN for Sunday's raid. Submissions close tonight at 23:15 JST.";
      } else {
        isGateOpen = false;
        currentSessionLabel = "Sunday Raid Session";
        nextStatusChangeMessage = "Bidding for Sunday's raid is CLOSED. Registration for Tuesday's event opens Sunday night at 23:15 JST.";
      }
      break;
  }

  return { isGateOpen, currentSessionLabel, nextStatusChangeMessage };
}