import BuyNowSaleArtworks from '../BuyNowSaleArtworks'
import MasonryGrid from 'desktop/components/react/masonry_grid/MasonryGrid'
import renderTestComponent from 'desktop/apps/auction/__tests__/utils/renderTestComponent'
import { ArtworkRail } from '../../artwork_rail/ArtworkRail'
import { promotedSaleArtworks } from '../__tests__/fixtures/promotedSaleArtworks'
import { cloneDeep } from 'lodash'

describe('auction/components/artwork_browser/BuyNowSaleArtworks', () => {
  const data = {
    app: {
      isMobile: false,
      auction: {
        name: 'An Auction',
        sale_type: 'auction promo',
        eligible_sale_artworks_count: 0,
        promoted_sale: {
          sale_artworks: promotedSaleArtworks
        }
      }
    }
  }

  it('renders a <ArtworkRail /> on desktop', () => {
    const { wrapper } = renderTestComponent({
      Component: BuyNowSaleArtworks,
      data,
      props: {
        promotedSaleArtworks
      }
    })

    wrapper.html().should.containEql('Buy Now')
    wrapper.find(ArtworkRail).length.should.eql(1)
  })

  it('renders a <MasonryGrid /> on mobile', () => {
    let mobileData = cloneDeep(data)
    mobileData.app.isMobile = true

    const { wrapper } = renderTestComponent({
      Component: BuyNowSaleArtworks,
      data: mobileData,
      props: {
        promotedSaleArtworks
      }
    })

    wrapper.html().should.containEql('Buy Now')
    wrapper.find(MasonryGrid).length.should.eql(1)
  })
})
