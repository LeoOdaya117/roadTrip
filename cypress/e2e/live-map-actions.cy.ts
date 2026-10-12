const tinyPng = Cypress.Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const stubMapTiles = () => {
  cy.intercept('GET', '**.tile.openstreetmap.org/**', { statusCode: 204, body: '' });
  cy.intercept('GET', '**.basemaps.cartocdn.com/**', { statusCode: 204, body: '' });
  cy.intercept('GET', '**.arcgisonline.com/**', { statusCode: 204, body: '' });
};

const installLocationStub = (win: Window) => {
  const position = {
    coords: {
      latitude: 14.6,
      longitude: 121,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: 5,
    },
    timestamp: Date.now(),
  } as GeolocationPosition;
  Object.defineProperty(win.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success: (value: GeolocationPosition) => void) { success(position); },
      watchPosition(success: (value: GeolocationPosition) => void) { success(position); return 1; },
      clearWatch() {},
    },
  });
  Object.defineProperty(win.navigator, 'permissions', {
    configurable: true,
    value: { query: () => Promise.resolve({ state: 'granted' }) },
  });
};

describe('live map actions', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    stubMapTiles();
    cy.visit('/ride-map/solo-action-audit', { onBeforeLoad: installLocationStub });
  });

  it('exercises map style, layer, overlay, marker, and web-only guidance controls', () => {
    cy.get('[aria-label="Center map on your location"]').click();
    cy.get('[aria-label="Zoom in"]').click();
    cy.get('[aria-label="Zoom out"]').click();
    cy.get('[aria-label="Navigate to a place"]').should('not.exist');

    cy.get('[aria-label="Change map style and details"]').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[aria-label="Switch map to Satellite"]').click().should('have.attr', 'aria-selected', 'true');
    cy.get('[aria-label="Switch map to Satellite"]').should('have.attr', 'aria-selected', 'true');
    cy.contains('.map-overlay-row button', 'Ride Path').should('have.attr', 'aria-pressed', 'true').click().should('have.attr', 'aria-pressed', 'false');
    cy.contains('.map-overlay-row button', 'Riders').should('have.attr', 'aria-pressed', 'true').click().should('have.attr', 'aria-pressed', 'false');
    cy.get('[aria-label="Use car marker"]').click().should('have.attr', 'aria-pressed', 'true');
    cy.get('[aria-label="Use location dot marker"]').click().should('have.attr', 'aria-pressed', 'true');
    cy.contains('.map-style-sheet-actions ion-button', 'Done').click();
    cy.get('[role="dialog"]').should('not.exist');
    cy.get('.leaflet-control-attribution').should('be.visible').then(($attribution) => {
      cy.get('.ride-map-content .bottom-sheet').then(($metrics) => {
        const attribution = $attribution[0].getBoundingClientRect();
        const metrics = $metrics[0].getBoundingClientRect();
        expect(attribution.bottom).to.be.at.most(metrics.top);
      });
    });
  });

  it('keeps follow optional, disengages it on a map drag, and preserves manual centering', () => {
    cy.get('[aria-label="Follow my location"]')
      .should('be.visible')
      .and('have.attr', 'aria-pressed', 'false');
    cy.get('[aria-label="Center map on your location"]').should('be.visible');

    cy.get('[aria-label="Follow my location"]')
      .click()
      .should('have.attr', 'aria-pressed', 'true');

    cy.get('.leaflet-container')
      .trigger('mousedown', { button: 0, which: 1, clientX: 150, clientY: 320, force: true })
      .trigger('mousemove', { button: 0, which: 1, clientX: 210, clientY: 360, force: true })
      .trigger('mouseup', { button: 0, which: 1, force: true });

    cy.get('[aria-label="Follow my location"]')
      .should('have.attr', 'aria-pressed', 'false')
      .click()
      .should('have.attr', 'aria-pressed', 'true');
    cy.get('[aria-label="Center map on your location"]').click();
    cy.get('[aria-label="Zoom in"]').should('be.visible');
  });

  it('opens and cancels the photo sheet without saving a record', () => {
    cy.get('[aria-label="Add ride photo"]').click();
    cy.get('input[type="file"]').selectFile({
      contents: tinyPng,
      fileName: 'ride-photo.png',
      mimeType: 'image/png',
    }, { force: true });
    cy.get('[role="dialog"]').should('be.visible').and('have.attr', 'aria-label', 'Save ride photo');
    cy.get('[role="dialog"] input[placeholder="Add a note or caption"]').should('be.visible').type('A test memory');
    cy.contains('[role="dialog"] ion-button', 'Cancel').click();
    cy.get('[role="dialog"]').should('not.exist');
    cy.window().then((win) => new Promise<void>((resolve, reject) => {
      const request = win.indexedDB.open('rideTrackerDb');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('photos', 'readonly');
        const getRequest = transaction.objectStore('photos').index('rideId').getAll('solo-action-audit');
        getRequest.onsuccess = () => {
          expect(getRequest.result).to.have.length(0);
          db.close();
          resolve();
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
    }));
  });

  it('saves a selected ride photo and reports success', () => {
    cy.get('[aria-label="Add ride photo"]').click();
    cy.get('input[type="file"]').selectFile({
      contents: tinyPng,
      fileName: 'ride-photo.png',
      mimeType: 'image/png',
    }, { force: true });
    cy.get('[role="dialog"] input[placeholder="Add a note or caption"]').should('be.visible').type('A saved memory');
    cy.contains('[role="dialog"] ion-button', 'Save photo').click();
    cy.get('[role="dialog"]').should('not.exist');
    cy.window().then((win) => new Promise<void>((resolve, reject) => {
      const request = win.indexedDB.open('rideTrackerDb');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('photos', 'readonly');
        const getRequest = transaction.objectStore('photos').index('rideId').getAll('solo-action-audit');
        getRequest.onsuccess = () => {
          expect(getRequest.result).to.have.length(1);
          expect(getRequest.result[0].note).to.equal('A saved memory');
          db.close();
          resolve();
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
    }));
  });
});
