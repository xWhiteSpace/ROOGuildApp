/**
 * ⏳ GUILD REGISTRATION TIME MATRIX SYSTEM (GMT+9)
 * Maps out the absolute schedule windows for active bidding registrations.
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
        nextStatusChangeMessage = "Bidding opens tonight at 23:15 JST for Tuesday's event.";
      } else {
        isGateOpen = true;
        currentSessionLabel = "Tuesday Registration Period";
        nextStatusChangeMessage = "Bidding closes Monday night at 23:15 JST.";
      }
      break;

    case 1: // MONDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = true;
        currentSessionLabel = "Tuesday Registration Period";
        nextStatusChangeMessage = "Bidding closes tonight at 23:15 JST.";
      } else {
        isGateOpen = false;
        currentSessionLabel = "Tuesday Raid Session";
        nextStatusChangeMessage = "Bidding opens Tuesday night at 23:15 JST for Thursday's event.";
      }
      break;

    case 2: // TUESDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = false;
        currentSessionLabel = "Tuesday Raid Session";
        nextStatusChangeMessage = "Bidding opens tonight at 23:15 JST for Thursday's event.";
      } else {
        isGateOpen = true;
        currentSessionLabel = "Thursday Registration Period";
        nextStatusChangeMessage = "Bidding closes Wednesday night at 23:15 JST.";
      }
      break;

    case 3: // WEDNESDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = true;
        currentSessionLabel = "Thursday Registration Period";
        nextStatusChangeMessage = "Bidding closes tonight at 23:15 JST.";
      } else {
        isGateOpen = false;
        currentSessionLabel = "Thursday Raid Session";
        nextStatusChangeMessage = "Bidding opens Thursday night at 23:15 JST for Sunday's event.";
      }
      break;

    case 4: // THURSDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = false;
        currentSessionLabel = "Thursday Raid Session";
        nextStatusChangeMessage = "Bidding opens tonight at 23:15 JST for Sunday's event.";
      } else {
        isGateOpen = true;
        currentSessionLabel = "Sunday Registration Period";
        nextStatusChangeMessage = "Bidding closes Saturday night at 23:15 JST.";
      }
      break;

    case 5: // FRIDAY
      // Friday remains completely open across the extended weekend preparation window
      isGateOpen = true;
      currentSessionLabel = "Sunday Registration Period";
      nextStatusChangeMessage = "Bidding closes Saturday night at 23:15 JST.";
      break;

    case 6: // SATURDAY
      if (currentMinutesOffset < cutoffMinutesOffset) {
        isGateOpen = true;
        currentSessionLabel = "Sunday Registration Period";
        nextStatusChangeMessage = "Bidding closes tonight at 23:15 JST.";
      } else {
        isGateOpen = false;
        currentSessionLabel = "Sunday Raid Session";
        nextStatusChangeMessage = "Bidding opens Sunday night at 23:15 JST for Tuesday's event.";
      }
      break;
  }

  return { isGateOpen, currentSessionLabel, nextStatusChangeMessage };
}