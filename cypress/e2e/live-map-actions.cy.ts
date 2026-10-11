const tinyPng = Cypress.Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const stubMapTiles = () => {
  cy.intercept('GET', '**.tile.openstreetmap.org/**', { statusCode: 204, body: '' });
  cy.intercept('GET', '**.basemaps.cartocdn.com/**', { statusCode: 204, body: '' });
  cy.intercept('GET', '**.arcgisonline.com/**', { statusCode: 204, body: '' });
};

describe('live map actions', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    stubMapTiles();
    cy.visit('/ride-map/solo-action-audit');
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
