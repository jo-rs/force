import { Box, color, media } from "@artsy/palette"
import { Conversations_me } from "v2/__generated__/Conversations_me.graphql"
import React from "react"
import { RelayRefetchProp, createRefetchContainer, graphql } from "react-relay"
import { ConversationSnippetFragmentContainer as ConversationSnippet } from "./ConversationSnippet"
import { NoMessages } from "./NoMessages"
import styled from "styled-components"

const Container = styled(Box)`
  min-height: 100vh;
  border-right: 1px solid ${color("black10")};
  ${media.xs`
    border-right: none;
  `};
`

interface ConversationsProps {
  me: Conversations_me
  relay: RelayRefetchProp
  selectedConversationID: string
}

const Conversations: React.FC<ConversationsProps> = props => {
  const { me, selectedConversationID } = props
  const conversations = me.conversationsConnection.edges

  const selectedConversationIndex = conversations
    .map(e => e.node.internalID)
    .indexOf(selectedConversationID)

  return (
    <>
      <Container width={["100%", "375px"]}>
        {conversations.length ? (
          <Box>
            {conversations.map(edge => (
              <ConversationSnippet
                selectedConversationID={selectedConversationID}
                isSelected={edge.node.internalID === selectedConversationID}
                conversation={edge.node}
                key={edge.cursor}
                hasDivider={
                  conversations.indexOf(edge) !== selectedConversationIndex &&
                  conversations.indexOf(edge) !==
                    selectedConversationIndex - 1 &&
                  conversations.indexOf(edge) !== conversations.length - 1
                }
              />
            ))}
          </Box>
        ) : (
          <NoMessages />
        )}
      </Container>
    </>
  )
}

export const ConversationsFragmentContainer = createRefetchContainer(
  Conversations as React.ComponentType<ConversationsProps>,
  {
    me: graphql`
      fragment Conversations_me on Me
        @argumentDefinitions(
          first: { type: "Int", defaultValue: 10 }
          last: { type: "Int" }
          after: { type: "String" }
          before: { type: "String" }
        ) {
        conversationsConnection(
          first: $first
          last: $last
          before: $before
          after: $after
        ) {
          edges {
            cursor
            node {
              id
              internalID
              lastMessage
              ...ConversationSnippet_conversation
            }
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    `,
  },
  graphql`
    query ConversationsQuery(
      $first: Int!
      $last: Int
      $after: String
      $before: String
    ) {
      me {
        ...Conversations_me
          @arguments(first: $first, last: $last, after: $after, before: $before)
      }
    }
  `
)
