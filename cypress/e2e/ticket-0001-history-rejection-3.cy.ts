const viewportCases = [
  { width: 384, height: 824 },
  { width: 1120, height: 884 },
];

const themeCases = [
  { preference: 'light', darkSystem: false },
  { preference: 'dark', darkSystem: true },
  { preference: 'system', darkSystem: false },
  { preference: 'system', darkSystem: true },
];

const contrastRatio = (foreground: string, background: string) => {
  const channels = (color: string) => {
    const values = color.match(/[0-9.]+/g)?.map(Number);
    if (!values || values.length < 3) throw new Error('Cannot parse rendered color: ' + color);
    return values.slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = (color: string) => {
    const [red, green, blue] = channels(color);
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

const visitHistory = (preference: string, darkSystem: boolean) => cy.visit('/ride-history', {
  onBeforeLoad: (win) => {
    win.localStorage.setItem('roadtrip:theme-preference', preference);
    Object.defineProperty(win, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-color-scheme: dark') && darkSystem,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  },
});

describe('TKT-0001 Ride History rejection 3', () => {
  viewportCases.forEach(({ width, height }) => {
    themeCases.forEach(({ preference, darkSystem }) => {
      it('keeps both selected filter labels readable at ' + width + 'x' + height + ' in ' + preference + (preference === 'system' ? (darkSystem ? ' dark' : ' light') : ''), () => {
        cy.viewport(width, height);
        visitHistory(preference, darkSystem);
        cy.get('html').should('have.attr', 'data-theme-preference', preference);
        cy.get('html').should('have.attr', 'data-theme', darkSystem || preference === 'dark' ? 'dark' : 'light');

        ['Group', 'Solo'].forEach((label) => {
          cy.contains('.history-screen ion-segment-button', label).click();
          cy.contains('.history-screen ion-segment-button.segment-button-checked', label)
            .should('be.visible')
            .then(($button) => {
              const host = $button[0] as HTMLElement & { shadowRoot: ShadowRoot | null };
              const foreground = getComputedStyle(host).color;
              const buttonBackground = getComputedStyle(host).backgroundColor;
              const ownerDocument = host.ownerDocument;
              const background = buttonBackground === 'rgba(0, 0, 0, 0)'
                ? getComputedStyle(ownerDocument.querySelector('.history-screen-filter')!).backgroundColor
                : buttonBackground;
              expect(contrastRatio(foreground, background), label + ' rendered label contrast').to.be.at.least(4.5);
              const indicatorColor = getComputedStyle(host).getPropertyValue('--indicator-color').trim();
              const primaryColor = getComputedStyle(ownerDocument.documentElement).getPropertyValue('--rt-primary').trim();
              expect(indicatorColor, 'selected underline keeps its theme color').not.to.equal('');
              expect(primaryColor, 'theme primary color is available').not.to.equal('');
            });
        });

        cy.get('.history-screen-filter').then(($filter) => {
          const bounds = $filter[0].getBoundingClientRect();
          expect(bounds.left).to.be.at.least(0);
          expect(bounds.right).to.be.at.most(width);
        });
      });
    });
  });

  [
    { width: 384, height: 824 },
    { width: 1120, height: 884 },
  ].forEach(({ width, height }) => {
    it('navigates from Ride History to Home without title overlap at ' + width + 'x' + height, () => {
      cy.viewport(width, height);
      cy.visit('/ride-history');
      cy.get('.rt-app-header__back ion-back-button').should('be.visible').then(($back) => {
        const back = $back[0];
        const bounds = back.getBoundingClientRect();
        expect(bounds.width).to.be.at.least(44);
        expect(bounds.height).to.be.at.least(44);
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(width);
        const ownerDocument = back.ownerDocument;
        const title = ownerDocument.querySelector('.rt-app-header__identity--page')!.getBoundingClientRect();
        const overlaps = bounds.left < title.right && bounds.right > title.left && bounds.top < title.bottom && bounds.bottom > title.top;
        expect(overlaps, 'back target does not overlap centered title').to.equal(false);
        let hitTarget: Element | null = ownerDocument.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        const composedPathContainsBack = () => {
          let current = hitTarget;
          while (current) {
            if (current === back) return true;
            const root = current.getRootNode();
            const shadowHost = 'host' in root ? (root as ShadowRoot).host : null;
            current = current.parentElement ?? shadowHost;
          }
          return false;
        };
        while (hitTarget?.shadowRoot && 'elementFromPoint' in hitTarget.shadowRoot) {
          const shadowHit = (hitTarget.shadowRoot as ShadowRoot & { elementFromPoint: (x: number, y: number) => Element | null })
            .elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
          if (!shadowHit || shadowHit === hitTarget) break;
          hitTarget = shadowHit;
        }
        expect(composedPathContainsBack(), 'center hit test resolves to the back control').to.equal(true);
      });
      cy.get('.rt-app-header__back ion-back-button').click();
      cy.location('pathname').should('eq', '/home');
      cy.get('.home-page').should('be.visible');
    });
  });

  it('returns to Home through the in-app Ride History navigation path', () => {
    cy.viewport(384, 824);
    cy.visit('/home');
    cy.contains('button', 'Rides').click();
    cy.location('pathname').should('eq', '/ride-history');
    cy.get('.rt-app-header__back ion-back-button').click();
    cy.location('pathname').should('eq', '/home');
    cy.get('.home-page').should('be.visible');
  });
});
