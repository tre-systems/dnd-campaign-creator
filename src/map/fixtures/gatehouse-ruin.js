/**
 * Shared test fixture: Gatehouse Ruin section.
 * Based on the worked example from the map system proposal.
 */

function createGatehouseSection() {
  return {
    id: "gatehouse-ruin",
    level: 1,
    chapter: "Act I",
    theme: "Goblin-occupied dwarven gatehouse",
    pressure: "faction",
    sessionLoad: "standard",
    promise:
      "Players breach the outer defences and discover the goblins are fortifying against something deeper.",
    layoutStrategy: "constructed",
    grid: { width: 30, height: 44 },
    density: "standard",

    nodes: [
      {
        id: "E1",
        type: "entry",
        name: "Collapsed Gate",
        sizeClass: "medium",
        sightline: "open",
        retreatOptions: ["G1"],
      },
      {
        id: "G1",
        type: "guard",
        name: "Guard Post",
        sizeClass: "medium",
        sightline: "partial",
        retreatOptions: ["H1"],
        occupants: "2 goblin sentries",
      },
      {
        id: "H1",
        type: "hub",
        name: "Gatehouse Hall",
        sizeClass: "medium",
        sightline: "open",
        retreatOptions: ["R1", "R3", "F1"],
      },
      {
        id: "R1",
        type: "standard",
        name: "Barracks",
        sizeClass: "small",
        sightline: "blocked",
        retreatOptions: ["H1"],
        occupants: "4 goblins",
      },
      {
        id: "R2",
        type: "resource",
        name: "Armoury",
        sizeClass: "small",
        sightline: "blocked",
        retreatOptions: ["R1"],
      },
      {
        id: "R3",
        type: "resource",
        name: "Kitchen/Well",
        sizeClass: "medium",
        sightline: "open",
        retreatOptions: ["X1"],
        occupants: "1 noncombatant cook",
      },
      {
        id: "F1",
        type: "faction-core",
        name: "Boss Room",
        sizeClass: "large",
        sightline: "open",
        retreatOptions: ["X1"],
        occupants: "Hobgoblin boss + 1 bodyguard",
      },
      {
        id: "S1",
        type: "secret",
        name: "Old Vault",
        sizeClass: "small",
        sightline: "blocked",
        retreatOptions: [],
      },
      {
        id: "X1",
        type: "exit",
        name: "Stairs Down",
        sizeClass: "small",
        sightline: "partial",
        retreatOptions: ["R3", "F1"],
      },
    ],

    edges: [
      {
        from: "E1",
        to: "G1",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "G1",
        to: "H1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "H1",
        to: "R1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "H1",
        to: "R3",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "H1",
        to: "F1",
        type: "locked",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R1",
        to: "R2",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R3",
        to: "X1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "F1",
        to: "S1",
        type: "secret",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "F1",
        to: "X1",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R2",
        to: "H1",
        type: "secret",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "E1",
        to: "H1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
    ],

    connectors: [
      {
        side: "bottom",
        offset: 12,
        width: 3,
        transitionType: "vertical",
        destination: "Deep Caves",
      },
    ],
  };
}

/**
 * Create a simple linear section that should FAIL validation (no loops, one route).
 */
function createLinearSection() {
  return {
    id: "linear-test",
    level: 1,
    theme: "Linear test dungeon",
    pressure: "hazard",
    sessionLoad: "light",
    promise: "A straight corridor.",
    grid: { width: 20, height: 20 },
    density: "sparse",

    nodes: [
      { id: "A", type: "entry", name: "Start", sizeClass: "small" },
      { id: "B", type: "standard", name: "Middle", sizeClass: "small" },
      { id: "C", type: "exit", name: "End", sizeClass: "small" },
    ],

    edges: [
      {
        from: "A",
        to: "B",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "B",
        to: "C",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
    ],
  };
}

/**
 * Create a large dungeon complex with 22 rooms.
 * Designed to produce dense Paratime-style blue maps.
 */
function createDwarvenComplexSection() {
  return {
    id: "dwarven-complex",
    level: 2,
    chapter: "Act II",
    theme: "Dwarven halls beneath the gatehouse",
    pressure: "faction",
    sessionLoad: "heavy",
    promise:
      "Players explore the ancient dwarven halls, confronting the darkness the goblins feared.",
    layoutStrategy: "constructed",
    grid: { width: 44, height: 44 },
    density: "dense",

    nodes: [
      // Entry cluster
      { id: "E1", type: "entry", name: "Stairs Up", sizeClass: "small" },
      {
        id: "R01",
        type: "guard",
        name: "Landing",
        sizeClass: "medium",
        occupants: "2 skeletons",
      },
      { id: "R02", type: "hub", name: "Great Hall", sizeClass: "large" },
      // West wing
      {
        id: "R03",
        type: "standard",
        name: "Barracks",
        sizeClass: "medium",
        occupants: "4 goblins",
      },
      {
        id: "R04",
        type: "standard",
        name: "Officers' Quarters",
        sizeClass: "small",
      },
      { id: "R05", type: "resource", name: "Armoury", sizeClass: "small" },
      { id: "R06", type: "standard", name: "Mess Hall", sizeClass: "medium" },
      { id: "R07", type: "standard", name: "Pantry", sizeClass: "small" },
      // East wing
      { id: "R08", type: "hub", name: "Gallery", sizeClass: "large" },
      { id: "R09", type: "standard", name: "Chapel", sizeClass: "medium" },
      { id: "R10", type: "standard", name: "Vestry", sizeClass: "small" },
      { id: "R11", type: "standard", name: "Library", sizeClass: "medium" },
      { id: "R12", type: "standard", name: "Scriptorium", sizeClass: "small" },
      // Central
      { id: "R13", type: "hub", name: "Crossroads", sizeClass: "medium" },
      { id: "R14", type: "standard", name: "Well Room", sizeClass: "small" },
      { id: "R15", type: "standard", name: "Store Room", sizeClass: "small" },
      // South wing
      {
        id: "R16",
        type: "standard",
        name: "Forge",
        sizeClass: "large",
        occupants: "2 fire elementals",
      },
      {
        id: "R17",
        type: "standard",
        name: "Smelting Room",
        sizeClass: "medium",
      },
      {
        id: "R18",
        type: "faction-core",
        name: "Throne Room",
        sizeClass: "large",
        occupants: "Wraith lord",
      },
      { id: "R19", type: "secret", name: "Treasury", sizeClass: "small" },
      {
        id: "R20",
        type: "standard",
        name: "Crypt",
        sizeClass: "medium",
        occupants: "3 wights",
      },
      { id: "X1", type: "exit", name: "Chasm Bridge", sizeClass: "small" },
    ],

    edges: [
      // Entry cluster
      {
        from: "E1",
        to: "R01",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R01",
        to: "R02",
        type: "door",
        bidirectional: true,
        width: "wide",
      },
      // West wing from Great Hall
      {
        from: "R02",
        to: "R03",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R03",
        to: "R04",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R03",
        to: "R05",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R02",
        to: "R06",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R06",
        to: "R07",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      // East wing from Great Hall
      {
        from: "R02",
        to: "R08",
        type: "open",
        bidirectional: true,
        width: "wide",
      },
      {
        from: "R08",
        to: "R09",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R09",
        to: "R10",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R08",
        to: "R11",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R11",
        to: "R12",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      // Central hub
      {
        from: "R02",
        to: "R13",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R08",
        to: "R13",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R13",
        to: "R14",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R13",
        to: "R15",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      // South wing
      {
        from: "R13",
        to: "R16",
        type: "locked",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R16",
        to: "R17",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R16",
        to: "R18",
        type: "door",
        bidirectional: true,
        width: "wide",
      },
      {
        from: "R18",
        to: "R19",
        type: "secret",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R18",
        to: "R20",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R18",
        to: "X1",
        type: "locked",
        bidirectional: true,
        width: "standard",
      },
      // Loop connections for tactical interest
      {
        from: "R06",
        to: "R13",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R05",
        to: "R06",
        type: "secret",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R20",
        to: "R14",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
    ],

    connectors: [
      {
        side: "top",
        offset: 22,
        width: 2,
        transitionType: "vertical",
        destination: "Gatehouse",
      },
      {
        side: "bottom",
        offset: 22,
        width: 2,
        transitionType: "vertical",
        destination: "Deep Caves",
      },
    ],
  };
}

/**
 * Medium-complexity flooded sanctum with mixed corridor widths, one-way flow,
 * and multiple boundary connectors.
 */
function createSunkenSanctumSection() {
  return {
    id: "sunken-sanctum",
    level: 2,
    chapter: "Act II",
    theme: "Flooded sanctum beneath the old lockworks",
    pressure: "hazard",
    sessionLoad: "heavy",
    promise:
      "Players navigate unstable sluices and ritual chambers to unlock a lower route.",
    layoutStrategy: "constructed",
    grid: { width: 36, height: 38 },
    density: "standard",

    nodes: [
      { id: "E1", type: "entry", name: "Crumbling Stair", sizeClass: "medium" },
      { id: "G1", type: "guard", name: "Sluice Guardpost", sizeClass: "small" },
      { id: "H1", type: "hub", name: "Flooded Hall", sizeClass: "large" },
      { id: "R1", type: "resource", name: "Pump Room", sizeClass: "medium" },
      {
        id: "R2",
        type: "standard",
        name: "Drain Gallery",
        sizeClass: "medium",
      },
      {
        id: "R3",
        type: "standard",
        name: "Chapel of Tides",
        sizeClass: "medium",
      },
      { id: "R4", type: "standard", name: "Well Shaft", sizeClass: "small" },
      {
        id: "B1",
        type: "faction-core",
        name: "Sunken Throne",
        sizeClass: "large",
      },
      { id: "S1", type: "secret", name: "Crypt Annex", sizeClass: "small" },
      { id: "Z1", type: "hazard", name: "Broken Weir", sizeClass: "medium" },
      {
        id: "T1",
        type: "set-piece",
        name: "Forge of Chains",
        sizeClass: "large",
      },
      { id: "X1", type: "exit", name: "Spiral Descent", sizeClass: "small" },
    ],

    edges: [
      {
        from: "E1",
        to: "G1",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "E1",
        to: "H1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "G1",
        to: "H1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },

      {
        from: "H1",
        to: "R1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R1",
        to: "R2",
        type: "open",
        bidirectional: true,
        width: "tight",
      },
      {
        from: "R2",
        to: "X1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },

      {
        from: "H1",
        to: "R3",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R3",
        to: "R4",
        type: "open",
        bidirectional: true,
        width: "tight",
      },
      {
        from: "R4",
        to: "X1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },

      {
        from: "H1",
        to: "B1",
        type: "locked",
        bidirectional: true,
        width: "wide",
      },
      {
        from: "B1",
        to: "S1",
        type: "secret",
        bidirectional: true,
        width: "tight",
      },
      {
        from: "S1",
        to: "R2",
        type: "secret",
        bidirectional: true,
        width: "tight",
      },

      {
        from: "H1",
        to: "Z1",
        type: "open",
        bidirectional: true,
        width: "tight",
      },
      {
        from: "Z1",
        to: "T1",
        type: "one-way",
        bidirectional: false,
        width: "standard",
      },
      {
        from: "T1",
        to: "X1",
        type: "door",
        bidirectional: true,
        width: "wide",
      },
      {
        from: "R1",
        to: "T1",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R3",
        to: "B1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
    ],

    connectors: [
      {
        side: "top",
        offset: 10,
        width: 2,
        transitionType: "vertical",
        destination: "Upper Cistern",
      },
      {
        side: "left",
        offset: 18,
        width: 3,
        transitionType: "horizontal",
        destination: "Canal Tunnels",
      },
      {
        side: "bottom",
        offset: 24,
        width: 2,
        transitionType: "vertical",
        destination: "Deep Sumps",
      },
    ],
  };
}

/**
 * Large clockwork archive with multiple hubs/exits and rich symbol-triggering
 * room names for dressing recipes.
 */
function createClockworkArchiveSection() {
  return {
    id: "clockwork-archive",
    level: 3,
    chapter: "Act III",
    theme: "Clockwork archive and regent vaults",
    pressure: "faction",
    sessionLoad: "heavy",
    promise:
      "Players infiltrate a fortified archive, then break through to the regent's vault route.",
    layoutStrategy: "constructed",
    grid: { width: 42, height: 40 },
    density: "dense",

    nodes: [
      { id: "E1", type: "entry", name: "Service Lift", sizeClass: "small" },
      {
        id: "G1",
        type: "guard",
        name: "Antechamber Guard",
        sizeClass: "small",
      },
      {
        id: "H1",
        type: "hub",
        name: "Great Hall of Gears",
        sizeClass: "large",
      },
      { id: "H2", type: "hub", name: "Archive Nexus", sizeClass: "medium" },
      {
        id: "R1",
        type: "standard",
        name: "Library Stacks",
        sizeClass: "medium",
      },
      {
        id: "R2",
        type: "standard",
        name: "Scriptorium Annex",
        sizeClass: "small",
      },
      {
        id: "R3",
        type: "resource",
        name: "Clockwork Well",
        sizeClass: "small",
      },
      {
        id: "R4",
        type: "standard",
        name: "Chapel of Brass",
        sizeClass: "medium",
      },
      {
        id: "R5",
        type: "standard",
        name: "Smelting Forge",
        sizeClass: "large",
      },
      { id: "R6", type: "hazard", name: "Arc Coil", sizeClass: "medium" },
      {
        id: "R7",
        type: "set-piece",
        name: "Observatory Gallery",
        sizeClass: "large",
      },
      {
        id: "F1",
        type: "faction-core",
        name: "Regent Throne",
        sizeClass: "large",
      },
      { id: "S1", type: "secret", name: "Royal Crypt", sizeClass: "small" },
      { id: "X1", type: "exit", name: "Abyss Stair", sizeClass: "small" },
      { id: "X2", type: "exit", name: "Vent Shaft", sizeClass: "small" },
    ],

    edges: [
      {
        from: "E1",
        to: "G1",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "E1",
        to: "H1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "G1",
        to: "H1",
        type: "open",
        bidirectional: true,
        width: "tight",
      },

      {
        from: "H1",
        to: "H2",
        type: "open",
        bidirectional: true,
        width: "wide",
      },
      {
        from: "H1",
        to: "R1",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R1",
        to: "R2",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R2",
        to: "X2",
        type: "one-way",
        bidirectional: false,
        width: "tight",
      },

      {
        from: "H2",
        to: "R3",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "H2",
        to: "R4",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R4",
        to: "F1",
        type: "locked",
        bidirectional: true,
        width: "wide",
      },
      {
        from: "F1",
        to: "S1",
        type: "secret",
        bidirectional: true,
        width: "tight",
      },
      {
        from: "S1",
        to: "R2",
        type: "secret",
        bidirectional: true,
        width: "tight",
      },

      {
        from: "H2",
        to: "R5",
        type: "open",
        bidirectional: true,
        width: "wide",
      },
      {
        from: "R5",
        to: "R6",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R6",
        to: "X1",
        type: "open",
        bidirectional: true,
        width: "standard",
      },

      {
        from: "H2",
        to: "R7",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R7",
        to: "X1",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R3",
        to: "R6",
        type: "door",
        bidirectional: true,
        width: "tight",
      },
      {
        from: "R1",
        to: "R3",
        type: "open",
        bidirectional: true,
        width: "standard",
      },
      {
        from: "R5",
        to: "F1",
        type: "door",
        bidirectional: true,
        width: "standard",
      },
    ],

    connectors: [
      {
        side: "top",
        offset: 6,
        width: 2,
        transitionType: "vertical",
        destination: "Upper Keep",
      },
      {
        side: "right",
        offset: 14,
        width: 2,
        transitionType: "horizontal",
        destination: "Clocktower",
      },
      {
        side: "bottom",
        offset: 20,
        width: 3,
        transitionType: "vertical",
        destination: "Lower Foundry",
      },
    ],
  };
}

module.exports = {
  createGatehouseSection,
  createLinearSection,
  createDwarvenComplexSection,
  createSunkenSanctumSection,
  createClockworkArchiveSection,
};
