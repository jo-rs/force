import { Box, Separator, Serif } from "@artsy/palette"
import { Match } from "found"

import { BidderPositionQueryResponse } from "v2/__generated__/BidderPositionQuery.graphql"
import { ConfirmBid_me } from "v2/__generated__/ConfirmBid_me.graphql"
import {
  ConfirmBidCreateBidderPositionMutation,
  ConfirmBidCreateBidderPositionMutationResponse,
} from "v2/__generated__/ConfirmBidCreateBidderPositionMutation.graphql"
import { routes_ConfirmBidQueryResponse } from "v2/__generated__/routes_ConfirmBidQuery.graphql"
import { BidFormFragmentContainer as BidForm } from "v2/Apps/Auction/Components/BidForm"
import { LotInfoFragmentContainer as LotInfo } from "v2/Apps/Auction/Components/LotInfo"
import { bidderPositionQuery } from "v2/Apps/Auction/Operations/BidderPositionQuery"
import { createCreditCardAndUpdatePhone } from "v2/Apps/Auction/Operations/CreateCreditCardAndUpdatePhone"
import { AppContainer } from "v2/Apps/Components/AppContainer"
import { track } from "v2/Artsy"
import * as Schema from "v2/Artsy/Analytics/Schema"
import { useTracking } from "v2/Artsy/Analytics/useTracking"
import { FormikHelpers as FormikActions } from "formik"
import { isEmpty } from "lodash"
import React from "react"
import { Title } from "react-head"
import {
  RelayProp,
  commitMutation,
  createFragmentContainer,
  graphql,
} from "react-relay"
import { ReactStripeElements } from "react-stripe-elements"
import createLogger from "v2/Utils/logger"
import {
  FormValuesForBidding,
  createStripeWrapper,
  determineDisplayRequirements,
  errorMessageForCard,
  toStripeAddress,
} from "v2/Apps/Auction/Components/Form"

const logger = createLogger("Apps/Auction/Routes/ConfirmBid")

type BidFormActions = FormikActions<FormValuesForBidding>

interface ConfirmBidProps extends ReactStripeElements.InjectedStripeProps {
  artwork: routes_ConfirmBidQueryResponse["artwork"]
  me: ConfirmBid_me
  relay: RelayProp
  match: Match
}

const MAX_POLL_ATTEMPTS = 20

export const ConfirmBidRoute: React.FC<ConfirmBidProps> = props => {
  let pollCount = 0
  let registrationTracked = false

  const { artwork, me, relay, stripe } = props
  const { saleArtwork } = artwork
  const { sale } = saleArtwork
  const { environment } = relay
  const { trackEvent } = useTracking()
  const { requiresPaymentInformation } = determineDisplayRequirements(
    sale.registrationStatus,
    me
  )

  let bidderId = sale.registrationStatus?.internalID

  function createBidderPosition(maxBidAmountCents: number) {
    return new Promise<ConfirmBidCreateBidderPositionMutationResponse>(
      (resolve, reject) => {
        commitMutation<ConfirmBidCreateBidderPositionMutation>(environment, {
          onCompleted: resolve,
          onError: reject,
          mutation: graphql`
            mutation ConfirmBidCreateBidderPositionMutation(
              $input: BidderPositionInput!
            ) {
              createBidderPosition(input: $input) {
                result {
                  position {
                    internalID
                    saleArtwork {
                      sale {
                        registrationStatus {
                          internalID
                          qualifiedForBidding
                        }
                      }
                    }
                  }
                  status
                  messageHeader
                }
              }
            }
          `,
          variables: {
            input: {
              saleID: sale.internalID,
              artworkID: artwork.internalID,
              maxBidAmountCents,
            },
          },
        })
      }
    )
  }

  function onJsError(actions: BidFormActions, error: Error) {
    logger.error(error)
    trackConfirmBidFailed([`JavaScript error: ${error.message}`])
    actions.setSubmitting(false)
    actions.setStatus(
      "Something went wrong while processing your bid. Please make sure your internet connection is active and try again"
    )
  }

  function trackConfirmBidFailed(errors: string[]) {
    trackEvent({
      action_type: Schema.ActionType.ConfirmBidFailed,
      bidder_id: bidderId,
      error_messages: errors,
    })
  }

  function trackConfirmBidSuccess(
    positionId: string,
    selectedBidAmountCents: number
  ) {
    trackEvent({
      action_type: Schema.ActionType.ConfirmBidSubmitted,
      bidder_position_id: positionId,
      bidder_id: bidderId,
      order_id: bidderId,
      products: [
        {
          product_id: artwork.internalID,
          quantity: 1,
          price: selectedBidAmountCents / 100,
        },
      ],
    })
  }

  function trackMaxBidSelected(maxBid: string) {
    trackEvent({
      action_type: Schema.ActionType.SelectedMaxBid,
      bidder_id: bidderId,
      order_id: bidderId,
      selected_max_bid_minor: maxBid,
    })
  }

  async function handleSubmit(
    values: FormValuesForBidding,
    actions: BidFormActions
  ) {
    const selectedBid = Number(values.selectedBid)

    if (requiresPaymentInformation) {
      const stripeAddress = toStripeAddress(values.address)
      const { phoneNumber } = values.address
      const { setFieldError, setSubmitting } = actions

      try {
        const { error, token } = await stripe.createToken(stripeAddress)

        if (error) {
          setFieldError("creditCard", error.message)
          setSubmitting(false)
          return
        }

        const { id } = token
        const {
          createCreditCard: { creditCardOrError },
        } = await createCreditCardAndUpdatePhone(environment, phoneNumber, id)

        // TODO: We are not handling errors for `updateMyUserProfile`. Should we?
        if (creditCardOrError.mutationError) {
          setFieldError(
            "creditCard",
            errorMessageForCard(creditCardOrError.mutationError.detail)
          )
          setSubmitting(false)
          return
        }
      } catch (error) {
        onJsError(actions, error)
        return
      }
    }

    createBidderPosition(selectedBid)
      .then(data => verifyBidderPosition({ actions, data, selectedBid }))
      .catch(error => onJsError(actions, error))
  }

  function verifyBidderPosition({
    actions,
    data,
    selectedBid,
  }: {
    actions: BidFormActions
    data: ConfirmBidCreateBidderPositionMutationResponse
    selectedBid: number
  }) {
    const { result } = data.createBidderPosition
    const { position, messageHeader } = result

    if (!bidderId && !registrationTracked) {
      const newBidderId =
        position?.saleArtwork?.sale?.registrationStatus?.internalID

      trackEvent({
        action_type: Schema.ActionType.RegistrationSubmitted,
        bidder_id: newBidderId,
      })
      registrationTracked = true
    }

    bidderId =
      bidderId || position?.saleArtwork?.sale?.registrationStatus?.internalID

    if (result.status === "SUCCESS") {
      bidderPositionQuery(environment, {
        bidderPositionID: position.internalID,
      })
        .then(res => checkBidderPosition({ actions, data: res, selectedBid }))
        .catch(error => onJsError(actions, error))
    } else {
      actions.setStatus(messageHeader)
      actions.setSubmitting(false)
      trackConfirmBidFailed([messageHeader])
    }
  }

  function checkBidderPosition({
    actions,
    data,
    selectedBid,
  }: {
    actions: BidFormActions
    data: BidderPositionQueryResponse
    selectedBid: number
  }) {
    const { bidderPosition } = data.me
    const { status, position, messageHeader } = bidderPosition

    if (status === "PENDING" && pollCount < MAX_POLL_ATTEMPTS) {
      // initiating new request here (vs setInterval) to make sure we wait for
      // the previous call to return before making a new one
      setTimeout(
        () =>
          bidderPositionQuery(environment, {
            bidderPositionID: position.internalID,
          })
            .then(res =>
              checkBidderPosition({ actions, data: res, selectedBid })
            )
            .catch(error => onJsError(actions, error)),
        1000
      )

      pollCount += 1
    } else if (status === "WINNING") {
      trackConfirmBidSuccess(position.internalID, selectedBid)
      const href = `/artwork/${artwork.slug}`
      window.location.assign(href)
    } else {
      actions.setStatus(messageHeader)
      actions.setSubmitting(false)
      trackConfirmBidFailed([messageHeader])
    }
  }

  return (
    <AppContainer>
      <Title>Confirm Bid | Artsy</Title>

      <Box maxWidth={550} px={[2, 0]} mx="auto" mt={[1, 0]} mb={[1, 100]}>
        <Serif size="8">Confirm your bid</Serif>

        <Separator />

        <LotInfo artwork={artwork} saleArtwork={artwork.saleArtwork} />

        <Separator />

        <BidForm
          artworkSlug={artwork.slug}
          initialSelectedBid={props.match?.location?.query?.bid}
          saleArtwork={saleArtwork}
          onSubmit={handleSubmit}
          onMaxBidSelect={trackMaxBidSelected}
          me={me as any}
          trackSubmissionErrors={errors =>
            !isEmpty(errors) && trackConfirmBidFailed(errors)
          }
        />
      </Box>
    </AppContainer>
  )
}

const StripeWrappedConfirmBidRoute = createStripeWrapper(ConfirmBidRoute)

const TrackingWrappedConfirmBidRoute = track<ConfirmBidProps>(props => ({
  context_page: Schema.PageName.AuctionConfirmBidPage,
  auction_slug: props.artwork.saleArtwork.sale.slug,
  artwork_slug: props.artwork.slug,
  sale_id: props.artwork.saleArtwork.sale.internalID,
  user_id: props.me.internalID,
}))(StripeWrappedConfirmBidRoute)

export const ConfirmBidRouteFragmentContainer = createFragmentContainer(
  TrackingWrappedConfirmBidRoute,
  {
    me: graphql`
      fragment ConfirmBid_me on Me {
        internalID
        hasQualifiedCreditCards
        ...BidForm_me
      }
    `,
  }
)

// For bundle splitting in router
export default ConfirmBidRouteFragmentContainer
