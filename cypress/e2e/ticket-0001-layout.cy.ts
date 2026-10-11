const viewportCases = [
  { width: 360, height: 640 },
  { width: 384, height: 824 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
];

const themes = ['light', 'dark', 'system'] as const;

const seedRide = (rideId: string) => cy.window().then((win) => new Promise<void>((resolve, reject) => {
  const request = win.indexedDB.open('rideTrackerDb');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('sessions')) {
      db.close();
      reject(new Error('Ride session store is unavailable'));
      return;
    }
    const transaction = db.transaction('sessions', 'readwrite');
    transaction.objectStore('sessions').put({
      rideId,
      userId: `user-${rideId}`,
      userName: 'Layout Tester',
      isHost: true,
      isSolo: true,
      createdAt: new Date().toISOString(),
      durationSeconds: 10,
      distanceMeters: 0,
      activeSegmentId: `segment-${rideId}`,
      status: 'active',
    });
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  };
}));

describe('TKT-0001 ride setup and live-map layout', () => {
  beforeEach(() => {
    cy.intercept('GET', '**.tile.openstreetmap.org/**', { statusCode: 204, body: '' });
    cy.intercept('GET', '**.basemaps.cartocdn.com/**', { statusCode: 204, body: '' });
    cy.intercept('GET', '**.arcgisonline.com/**', { statusCode: 204, body: '' });
  });

  it('keeps all navigation items centered and inside the viewport across themes and sizes', () => {
    themes.forEach((theme) => viewportCases.forEach(({ width, height }) => {
      cy.viewport(width, height);
      cy.visit('/home', {
        onBeforeLoad: (win) => win.localStorage.setItem('roadtrip:theme-preference', theme),
      });
      cy.get('html').should('have.attr', 'data-theme-preference', theme);
      cy.get('.route-navigation').should('be.visible').then(($nav) => {
        const bounds = $nav[0].getBoundingClientRect();
        expect(bounds.left, `${width}x${height} nav left`).to.be.at.least(0);
        expect(bounds.right, `${width}x${height} nav right`).to.be.at.most(width);
        expect(Math.abs((bounds.left + bounds.right) / 2 - width / 2), `${width}x${height} nav center`).to.be.at.most(2);
        expect(bounds.bottom, `${width}x${height} nav bottom`).to.be.at.most(height);
        expect(height - bounds.bottom, `${width}x${height} nav safe bottom`).to.be.at.most(16);
      });
      cy.get('.route-navigation-item').should('have.length', 3).each(($item) => {
        const bounds = $item[0].getBoundingClientRect();
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(width);
      });
    }));
  });

  it('keeps setup cards and destination actions inset, centers Back, and gives review more map area', () => {
    cy.viewport(384, 824);
    cy.visit('/home');
    cy.contains('button', 'Start a ride').click();

    cy.get('.ride-setup-choice').first().then(($card) => {
      const style = getComputedStyle($card[0]);
      expect(Number.parseFloat(style.paddingLeft)).to.be.at.least(12);
      expect(Number.parseFloat(style.paddingRight)).to.be.at.least(12);
    });
    cy.get('.ride-setup-actions button').contains('Choose destination').click();

    cy.get('.ride-setup-map-back').should('be.visible').then(($back) => {
      const bounds = $back[0].getBoundingClientRect();
      const style = getComputedStyle($back[0]);
      expect(bounds.width).to.be.at.least(44);
      expect(bounds.height).to.be.at.least(44);
      expect(style.display).to.match(/flex|grid/);
      if (style.display === 'grid') {
        expect(style.placeItems).to.include('center');
      } else {
        expect(style.alignItems).to.equal('center');
        expect(style.justifyContent).to.equal('center');
      }
    });
    cy.get('.ride-setup-search-floating input').then(($input) => {
      const style = getComputedStyle($input[0]);
      expect(Number.parseFloat(style.paddingLeft)).to.be.at.least(18);
      expect(Number.parseFloat(style.paddingRight)).to.be.at.least(18);
      cy.get('.ride-setup-search-floating').then(($card) => {
        const inputBounds = $input[0].getBoundingClientRect();
        const cardBounds = $card[0].getBoundingClientRect();
        const leftGap = inputBounds.left - cardBounds.left;
        const rightGap = cardBounds.right - inputBounds.right;
        expect(leftGap, 'search input outer left inset').to.be.at.least(16);
        expect(rightGap, 'search input outer right inset').to.be.at.least(16);
        expect(Math.abs(leftGap - rightGap), 'balanced search input outer inset').to.be.at.most(2);
      });
    });
    cy.get('.ride-setup-full-map').should('be.visible').then(($map) => {
      const bounds = $map[0].getBoundingClientRect();
      expect(bounds.width).to.be.greaterThan(300);
      expect(bounds.height).to.be.greaterThan(300);
    });
    cy.get('.ride-setup-destination-map .ride-setup-actions').then(($footer) => {
      const bounds = $footer[0].getBoundingClientRect();
      const style = getComputedStyle($footer[0]);
      expect(Number.parseFloat(style.paddingLeft)).to.be.at.least(10);
      expect(Number.parseFloat(style.paddingRight)).to.be.at.least(10);
      expect(bounds.left).to.be.at.least(0);
      expect(bounds.right).to.be.at.most(384);
      const [back, primary] = [...$footer[0].querySelectorAll('button')].map((button) => button.getBoundingClientRect());
      expect(back.right).to.be.lessThan(primary.left);
      expect(primary.right).to.be.at.most(bounds.right - Number.parseFloat(style.paddingRight) + 1);
    });

    cy.get('.ride-setup-full-map').click(140, 190);
    cy.contains('.ride-setup-map-hint', 'Selected · Map pin').should('exist');
    cy.contains('.ride-setup-actions button', 'Use destination').click();
    cy.contains('.ride-setup-heading-copy', 'Review your ride').should('be.visible');
    cy.get('.ride-setup-review-map').should('be.visible').then(($map) => {
      expect($map[0].getBoundingClientRect().height).to.be.at.least(220);
    });
    cy.contains('.ride-setup-actions button', 'Start solo ride').should('be.visible').then(($button) => {
      const bounds = $button[0].getBoundingClientRect();
      expect(bounds.left).to.be.at.least(0);
      expect(bounds.right).to.be.at.most(384);
      expect(bounds.bottom).to.be.at.most(824);
    });
  });

  it('keeps destination and review geometry reachable across the full viewport and theme matrix', () => {
    viewportCases.forEach(({ width, height }) => themes.forEach((theme) => {
      cy.viewport(width, height);
      cy.visit('/home', {
        onBeforeLoad: (win) => win.localStorage.setItem('roadtrip:theme-preference', theme),
      });
      cy.contains('button', 'Start a ride').click();
      cy.contains('.ride-setup-actions button', 'Choose destination').click();
      cy.get('.ride-setup-search-floating').should('be.visible').then(($card) => {
        const cardBounds = $card[0].getBoundingClientRect();
        const inputBounds = $card[0].querySelector('input')!.getBoundingClientRect();
        const leftGap = inputBounds.left - cardBounds.left;
        const rightGap = cardBounds.right - inputBounds.right;
        expect(leftGap, `${width}x${height} ${theme} search input left inset`).to.be.at.least(16);
        expect(rightGap, `${width}x${height} ${theme} search input right inset`).to.be.at.least(16);
        expect(Math.abs(leftGap - rightGap), `${width}x${height} ${theme} balanced search inset`).to.be.at.most(2);
      });
      cy.get('.ride-setup-full-map').should('exist').then(($map) => {
        const mapBounds = $map[0].getBoundingClientRect();
        expect(mapBounds.width, `${width}x${height} ${theme} destination map width`).to.be.greaterThan(250);
        expect(mapBounds.height, `${width}x${height} ${theme} destination map height`).to.be.at.least(132);
        expect(mapBounds.left).to.be.at.least(0);
        expect(mapBounds.right).to.be.at.most(width);
      });
      cy.get('.ride-setup-full-map').then(($map) => {
        const bounds = $map[0].getBoundingClientRect();
        cy.wrap($map).click(bounds.width / 2, bounds.height * 0.72);
      });
      cy.contains('.ride-setup-map-hint', 'Selected · Map pin').should('exist');
      cy.contains('.ride-setup-actions button', 'Use destination').click();
      cy.get('.ride-setup-review-map').should('exist').then(($map) => {
        const mapBounds = $map[0].getBoundingClientRect();
        expect(mapBounds.height, `${width}x${height} ${theme} review map height`).to.be.at.least(132);
        expect(mapBounds.left).to.be.at.least(0);
        expect(mapBounds.right).to.be.at.most(width);
      });
      cy.get('ion-content.ride-setup-modal-content').then(($content) => ($content[0] as HTMLIonContentElement).scrollToBottom(0));
      cy.contains('.ride-setup-actions button', 'Start solo ride').should('exist').then(($button) => {
        const bounds = $button[0].getBoundingClientRect();
        expect(bounds.left, `${width}x${height} ${theme} review action left`).to.be.at.least(0);
        expect(bounds.right, `${width}x${height} ${theme} review action right`).to.be.at.most(width);
        expect(bounds.top, `${width}x${height} ${theme} review action top`).to.be.at.least(0);
        expect(bounds.bottom, `${width}x${height} ${theme} review action bottom`).to.be.at.most(height);
      });
    }));
  });

  it('keeps the setup map, review map, and primary action reachable in short landscape dark mode', () => {
    cy.viewport(844, 390);
    cy.visit('/home', {
      onBeforeLoad: (win) => win.localStorage.setItem('roadtrip:theme-preference', 'dark'),
    });
    cy.contains('button', 'Start a ride').click();
    cy.contains('.ride-setup-actions button', 'Choose destination').click();
    cy.get('.ride-setup-full-map').should('exist').then(($map) => {
      const bounds = $map[0].getBoundingClientRect();
      expect(bounds.width).to.be.greaterThan(500);
      expect(bounds.height).to.be.at.least(200);
    });
    cy.get('.ride-setup-destination-map .ride-setup-actions').then(($footer) => {
      const bounds = $footer[0].getBoundingClientRect();
      expect(bounds.left).to.be.at.least(0);
      expect(bounds.right).to.be.at.most(844);
      expect(bounds.bottom).to.be.at.most(390);
    });

    cy.get('.ride-setup-full-map').click(200, 160);
    cy.contains('.ride-setup-actions button', 'Use destination').click();
    cy.get('.ride-setup-review-map').should('exist').then(($map) => {
      expect($map[0].getBoundingClientRect().height).to.be.at.least(132);
    });
    cy.contains('.ride-setup-actions button', 'Start solo ride').should('exist').then(($button) => {
      const bounds = $button[0].getBoundingClientRect();
      expect(bounds.left).to.be.at.least(0);
      expect(bounds.right).to.be.at.most(844);
      expect(bounds.bottom).to.be.at.most(390);
    });
  });

  it('keeps map labels separate, renders one dock line, and centers end confirmation', () => {
    cy.viewport(384, 824);
    const rideId = `solo-tkt-0001-${Date.now()}`;
    cy.visit('/home');
    seedRide(rideId);
    cy.visit(`/ride-map/${rideId}`);

    cy.get('.map-title-stack').should('exist').then(($stack) => {
      const title = $stack.find('.map-title')[0].getBoundingClientRect();
      const secondary = $stack.find('.map-title-secondary')[0].getBoundingClientRect();
      expect(secondary.top).to.be.at.least(title.bottom);
    });
    cy.get('.bottom-sheet').should('have.class', 'is-collapsed');

    cy.get('[data-ride-action="end"]').then(($button) => {
      const button = $button[0];
      const icon = button.querySelector('ion-icon')!;
      const label = button.querySelector('span')!;
      const style = getComputedStyle(button);
      expect(style.display).to.match(/flex/);
      expect(style.alignItems).to.equal('center');
      expect(style.justifyContent).to.equal('center');
      const iconBounds = icon.getBoundingClientRect();
      const labelBounds = label.getBoundingClientRect();
      expect(Math.abs((iconBounds.top + iconBounds.bottom) / 2 - (labelBounds.top + labelBounds.bottom) / 2)).to.be.at.most(2);
    });

    cy.get('.sheet-handle').should('be.visible').then(($handle) => {
      const line = getComputedStyle($handle[0], '::before');
      expect(line.content).to.not.equal('none');
      expect(Number.parseFloat(line.width)).to.be.greaterThan(0);
    });
    cy.get('.sheet-stats-row').then(($row) => {
      expect(getComputedStyle($row[0]).borderBottomWidth).to.equal('0px');
    });
    cy.get('.ride-action-bar').then(($row) => {
      expect(getComputedStyle($row[0]).borderTopWidth).to.equal('0px');
    });
    cy.get('.sheet-handle').click();
    cy.get('.bottom-sheet').should('have.class', 'is-expanded');
    cy.get('.leaflet-control-attribution').then(($attribution) => {
      const attribution = $attribution[0].getBoundingClientRect();
      cy.get('.bottom-sheet').then(($sheet) => {
        const sheet = $sheet[0].getBoundingClientRect();
        expect(attribution.bottom).to.be.lessThan(sheet.top);
      });
    });
    cy.get('.sheet-handle').click();
    cy.get('.bottom-sheet').should('have.class', 'is-collapsed');

    cy.get('[data-ride-action="end"]').click();
    cy.get('[role="alertdialog"]').should('be.visible').then(($dialog) => {
      const bounds = $dialog[0].getBoundingClientRect();
      expect(Math.abs((bounds.left + bounds.right) / 2 - 192)).to.be.at.most(8);
      expect(Math.abs((bounds.top + bounds.bottom) / 2 - 412)).to.be.at.most(8);
      expect(bounds.left).to.be.at.least(0);
      expect(bounds.right).to.be.at.most(384);
      expect(bounds.top).to.be.at.least(0);
      expect(bounds.bottom).to.be.at.most(824);
    });
    cy.get('[data-ride-end-cancel]').click();
    cy.get('[role="alertdialog"]').should('not.exist');
    cy.location('pathname').should('eq', `/ride-map/${rideId}`);

    cy.get('[data-ride-action="end"]').click();
    cy.get('[data-ride-end-confirm]').click();
    cy.location('pathname').should('eq', '/home');
  });

  it('centers the end confirmation within the safe viewport across sizes and themes', () => {
    themes.forEach((theme) => viewportCases.forEach(({ width, height }) => {
      const rideId = `solo-tkt-dialog-${width}-${height}-${theme}-${Date.now()}`;
      cy.viewport(width, height);
      cy.visit('/home', {
        onBeforeLoad: (win) => win.localStorage.setItem('roadtrip:theme-preference', theme),
      });
      seedRide(rideId);
      cy.visit(`/ride-map/${rideId}`);
      cy.get('[data-ride-action="end"]').click();
      cy.get('[role="alertdialog"]').should('be.visible').then(($dialog) => {
        const bounds = $dialog[0].getBoundingClientRect();
        expect(Math.abs((bounds.left + bounds.right) / 2 - width / 2), `${width}x${height} ${theme} dialog horizontal center`).to.be.at.most(10);
        expect(Math.abs((bounds.top + bounds.bottom) / 2 - height / 2), `${width}x${height} ${theme} dialog vertical center`).to.be.at.most(10);
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(width);
        expect(bounds.top).to.be.at.least(0);
        expect(bounds.bottom).to.be.at.most(height);
      });
      cy.get('[data-ride-end-cancel]').click();
      cy.get('[role="alertdialog"]').should('not.exist');
    }));
  });

  it('keeps every map style horizontally reachable by touch scrolling and keyboard focus', () => {
    const cases = [
      { width: 360, height: 640 },
      { width: 384, height: 824 },
      { width: 844, height: 390 },
    ];
    cases.forEach(({ width, height }) => themes.forEach((theme) => {
      cy.viewport(width, height);
      cy.visit('/ride-map/solo-map-style-scroll', {
        onBeforeLoad: (win) => win.localStorage.setItem('roadtrip:theme-preference', theme),
      });
      cy.get('[aria-label="Change map style and details"]').click();
      cy.get('[role="tablist"][aria-label="Map style selector"]').should('be.visible').then(($row) => {
        const row = $row[0] as HTMLElement;
        const style = getComputedStyle(row);
        expect(style.overflowX).to.match(/auto|scroll/);
        expect(style.touchAction).to.include('pan-x');
        if (row.scrollWidth > row.clientWidth) {
          cy.wrap($row).scrollTo('right').should(($scroller) => {
            expect(($scroller[0] as HTMLElement).scrollLeft).to.be.greaterThan(0);
          });
        }
      });
      cy.get('[role="tablist"][aria-label="Map style selector"] .map-style-card').last().then(($last) => {
        const last = $last[0] as HTMLButtonElement;
        cy.get('[role="tablist"][aria-label="Map style selector"]').then(($row) => {
          const row = $row[0].getBoundingClientRect();
          const option = last.getBoundingClientRect();
          expect(option.left).to.be.at.least(row.left - 1);
          expect(option.right).to.be.at.most(row.right + 1);
        });
        cy.wrap($last).click().should('have.attr', 'aria-selected', 'true');
        cy.wrap($last).focus().type('{leftarrow}');
        cy.get('[role="tablist"][aria-label="Map style selector"] .map-style-card').eq(-2).should('have.attr', 'aria-selected', 'true').and('have.focus');
      });
    }));
  });
});
