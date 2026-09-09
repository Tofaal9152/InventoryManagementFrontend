export function createDemoState() {
  return {
    metadata: {
      schemaVersion: 3,
      seededAt: new Date().toISOString()
    },
    users: [
      { id: 'user-admin', name: 'Ahsan Hossain', role: 'Admin', active: true }
    ],
    categories: [
      { id: 'category-ic', name: 'Integrated Circuits', description: 'Logic, analogue and microcontroller ICs.' },
      { id: 'category-passive', name: 'Passive Components', description: 'Resistors, capacitors and related parts.' },
      { id: 'category-led', name: 'Indicators', description: 'LEDs and panel indicators.' }
    ],
    units: [
      { id: 'unit-pcs', name: 'Pieces', symbol: 'pcs', allowFraction: false },
      { id: 'unit-m', name: 'Metres', symbol: 'm', allowFraction: true },
      { id: 'unit-g', name: 'Grams', symbol: 'g', allowFraction: true }
    ],
    projects: [
      { id: 'project-steelguard', name: 'SteelGuard', description: 'Pipe inspection controller prototype.', status: 'Active', createdBy: 'user-admin' },
      { id: 'project-training-kit', name: 'Training Kit', description: 'Electronics lab practice boards.', status: 'Active', createdBy: 'user-admin' },
      { id: 'project-legacy-fixture', name: 'Legacy Fixture', description: 'Closed fixture maintenance project.', status: 'Closed', createdBy: 'user-admin' }
    ],
    requisitions: [
      {
        id: 'REQ-0001',
        componentId: 'component-resistor-1k',
        freeTextPartName: '',
        quantity: 100,
        unitId: 'unit-pcs',
        projectId: 'project-training-kit',
        neededBy: '2026-09-18',
        note: 'Replenish lab practice-board stock.',
        requesterId: 'user-admin',
        createdOn: '2026-09-08T09:00:00.000Z',
        status: 'Pending',
        statusHistory: [{ fromStatus: null, toStatus: 'Pending', note: 'Requisition raised.', actorId: 'user-admin', timestamp: '2026-09-08T09:00:00.000Z' }]
      },
      {
        id: 'REQ-0002',
        componentId: null,
        freeTextPartName: '12 V DC panel-mount socket',
        quantity: 12,
        unitId: 'unit-pcs',
        projectId: 'project-steelguard',
        neededBy: '',
        note: 'Required for the controller enclosure.',
        requesterId: 'user-admin',
        createdOn: '2026-09-05T06:30:00.000Z',
        status: 'Approved',
        statusHistory: [
          { fromStatus: null, toStatus: 'Pending', note: 'Requisition raised.', actorId: 'user-admin', timestamp: '2026-09-05T06:30:00.000Z' },
          { fromStatus: 'Pending', toStatus: 'Approved', note: 'Approved for prototype build.', actorId: 'user-admin', timestamp: '2026-09-06T08:45:00.000Z' }
        ]
      }
    ],
    auditLog: [
      { id: 'audit-001', entity: 'Component', action: 'Created', summary: 'LM358N Dual Op-Amp added to Library.', actorId: 'user-admin', timestamp: '2026-09-07T08:00:00.000Z' },
      { id: 'audit-002', entity: 'Cabinet', action: 'Configured', summary: 'Cabinet 1 configured with 4 columns and 4 rows.', actorId: 'user-admin', timestamp: '2026-09-07T08:10:00.000Z' }
    ],
    components: [
      {
        id: 'component-lm358',
        image: null,
        name: 'LM358N Dual Op-Amp',
        partNumber: 'LM358N',
        categoryId: 'category-ic',
        unitId: 'unit-pcs',
        description: 'Dual low-power operational amplifier in DIP-8 package.',
        manufacturer: 'Texas Instruments',
        lastBuyingPrice: 38,
        deliveryCharge: 0,
        minimumQuantity: 8,
        datasheetUrl: 'https://www.ti.com/lit/ds/symlink/lm358.pdf',
        createdOn: '2026-09-07T08:00:00.000Z',
        updatedOn: '2026-09-09T07:30:00.000Z'
      },
      {
        id: 'component-resistor-1k',
        image: null,
        name: '1 kOhm Resistor',
        partNumber: 'RES-1K-1/4W',
        categoryId: 'category-passive',
        unitId: 'unit-pcs',
        description: 'Quarter-watt through-hole resistor, 1% tolerance.',
        manufacturer: 'Yageo',
        lastBuyingPrice: 1.2,
        deliveryCharge: 0,
        minimumQuantity: 20,
        datasheetUrl: '',
        createdOn: '2026-09-06T08:00:00.000Z',
        updatedOn: '2026-09-08T09:00:00.000Z'
      },
      {
        id: 'component-capacitor-100n',
        image: null,
        name: '100 nF Ceramic Capacitor',
        partNumber: 'CAP-100N-50V',
        categoryId: 'category-passive',
        unitId: 'unit-pcs',
        description: '50 V multilayer ceramic capacitor.',
        manufacturer: 'Murata',
        lastBuyingPrice: 2.5,
        deliveryCharge: 0,
        minimumQuantity: 15,
        datasheetUrl: '',
        createdOn: '2026-09-05T08:00:00.000Z',
        updatedOn: '2026-09-07T12:00:00.000Z'
      },
      {
        id: 'component-led-red',
        image: null,
        name: '5 mm Red LED',
        partNumber: 'LED-RED-5MM',
        categoryId: 'category-led',
        unitId: 'unit-pcs',
        description: 'Red diffused through-hole LED.',
        manufacturer: 'Kingbright',
        lastBuyingPrice: 4,
        deliveryCharge: 0,
        minimumQuantity: 30,
        datasheetUrl: '',
        createdOn: '2026-09-04T08:00:00.000Z',
        updatedOn: '2026-09-08T08:15:00.000Z'
      }
    ],
    cabinetGroups: [
      { id: 'group-lab', name: 'Electronics Lab', cabinetIds: ['cabinet-1'] }
    ],
    cabinets: [
      {
        id: 'cabinet-1',
        name: 'Cabinet 1',
        rows: 4,
        columns: ['A', 'B', 'C', 'D'],
        groupId: 'group-lab',
        drawers: [
          { id: 'drawer-a1', code: 'A1', row: 1, column: 'A', sectionCount: 1, componentId: 'component-lm358', quantity: 24, note: 'DIP IC drawer' },
          { id: 'drawer-b1', code: 'B1', row: 1, column: 'B', sectionCount: 1, componentId: 'component-resistor-1k', quantity: 12, note: 'Low stock example' },
          { id: 'drawer-c1', code: 'C1', row: 1, column: 'C', sectionCount: 1, componentId: 'component-capacitor-100n', quantity: 0, note: 'Assigned but out of stock' },
          { id: 'drawer-d1', code: 'D1', row: 1, column: 'D', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-a2', code: 'A2', row: 2, column: 'A', sectionCount: 1, componentId: 'component-led-red', quantity: 66, note: '' },
          { id: 'drawer-b2', code: 'B2', row: 2, column: 'B', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-c2', code: 'C2', row: 2, column: 'C', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-d2', code: 'D2', row: 2, column: 'D', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-a3', code: 'A3', row: 3, column: 'A', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-b3', code: 'B3', row: 3, column: 'B', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-c3', code: 'C3', row: 3, column: 'C', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-d3', code: 'D3', row: 3, column: 'D', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-a4', code: 'A4', row: 4, column: 'A', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-b4', code: 'B4', row: 4, column: 'B', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-c4', code: 'C4', row: 4, column: 'C', sectionCount: 1, componentId: null, quantity: 0, note: '' },
          { id: 'drawer-d4', code: 'D4', row: 4, column: 'D', sectionCount: 1, componentId: null, quantity: 0, note: '' }
        ]
      }
    ],
    movements: [
      {
        id: 'movement-001',
        type: 'Take',
        componentId: 'component-lm358',
        sourceDrawerId: 'drawer-a1',
        destinationDrawerId: null,
        quantity: 2,
        projectId: 'project-steelguard',
        note: 'Prototype testing',
        userId: 'user-admin',
        timestamp: '2026-09-09T07:30:00.000Z'
      },
      {
        id: 'movement-002',
        type: 'Add',
        componentId: 'component-led-red',
        sourceDrawerId: null,
        destinationDrawerId: 'drawer-a2',
        quantity: 80,
        projectId: null,
        note: 'Initial demo stock',
        userId: 'user-admin',
        timestamp: '2026-09-08T08:15:00.000Z'
      }
    ]
  };
}
