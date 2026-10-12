//
//  FlashcardViews.swift
//  FARAIMPro
//
//  Views for flashcard functionality
//

import SwiftUI

struct FlashcardListView: View {
    @ObservedObject var dataService = DataService.shared
    
    var body: some View {
        ScrollView {
            if dataService.flashcardDecks.isEmpty {
                LibraryCollectionStateView(
                    catalog: .flashcards,
                    title: "Flashcard Decks",
                    systemImage: "rectangle.on.rectangle.angled"
                )
            } else {
                LazyVStack(spacing: 12) {
                LibraryLoadErrorBanner(catalog: .flashcards)

                ReferenceLibraryBanner(
                    eyebrow: "ACTIVE RECALL",
                    title: "Flashcard decks",
                    detail: "\(dataService.flashcardDecks.reduce(0) { $0 + $1.cardCount }) cards across \(dataService.flashcardDecks.count) decks",
                    icon: "rectangle.on.rectangle.angled"
                )

                ForEach(dataService.flashcardDecks) { deck in
                    NavigationLink(destination: FlashcardStudyView(deck: deck)) {
                        StudyResourceCard(
                            eyebrow: deck.category.uppercased(),
                            title: deck.title,
                            description: deck.description,
                            metrics: [("\(deck.cardCount)", "cards")],
                            icon: "rectangle.on.rectangle.angled"
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
                .frame(maxWidth: 900)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Flashcards")
        .aviationScreen()
    }
}

struct FlashcardStudyView: View {
    let deck: FlashcardDeck
    @State private var progress = FlashcardStudyProgress()
    @State private var isFlipped = false
    @State private var cards: [Flashcard]
    @State private var confirmShuffle = false
    @State private var confirmRestart = false
    @State private var feedbackTrigger = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(deck: FlashcardDeck) {
        self.deck = deck
        _cards = State(initialValue: deck.cards)
    }

    private var currentIndex: Int { progress.currentIndex }
    private var knownCards: Set<String> { progress.knownCardIDs }
    private var unknownCards: Set<String> { progress.learningCardIDs }
    private var cardIDs: [String] { cards.map(\.id) }
    private var uniqueCardCount: Int { Set(cardIDs).count }
    
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
            // Progress
            VStack(spacing: 8) {
                HStack {
                    Text(progress.isComplete
                         ? "Deck complete"
                         : cards.isEmpty ? "No cards" : "Card \(currentIndex + 1) of \(cards.count)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Spacer()
                    HStack(spacing: 12) {
                        Label("\(knownCards.count)", systemImage: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Label("\(unknownCards.count)", systemImage: "xmark.circle.fill")
                            .foregroundColor(.red)
                    }
                    .font(.subheadline)
                }
                
                ProgressView(
                    value: Double(progress.assessedCount),
                    total: Double(max(uniqueCardCount, 1))
                )
                    .tint(AviationTheme.accent)
            }
            .padding()
            .background(Color(.systemBackground))

            if progress.isComplete {
                FlashcardCompletionView(
                    totalCount: uniqueCardCount,
                    knownCount: knownCards.count,
                    learningCount: unknownCards.count,
                    onRestart: resetDeck
                )
                .padding()
                Spacer()
            } else if cards.isEmpty {
                ContentUnavailableView(
                    "No Cards in This Deck",
                    systemImage: "rectangle.on.rectangle",
                    description: Text("Choose another flashcard deck.")
                )
            } else {
            Spacer()
            
            // Flashcard
            if !cards.isEmpty {
                FlashcardView(
                    card: cards[currentIndex],
                    isFlipped: isFlipped
                )
                .onTapGesture(perform: flipCard)
                .padding(.horizontal)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(isFlipped
                    ? "Definition. \(cards[currentIndex].back)"
                    : "Term. \(cards[currentIndex].front)")
                .accessibilityValue(isFlipped ? "Back of card" : "Front of card")
                .accessibilityHint(isFlipped ? "Double tap to show term" : "Double tap to show definition")
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { flipCard() }
            }
            
            Spacer()
            
            // Controls
            VStack(spacing: 16) {
                Text("Tap card to flip")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                // Know / Don't Know buttons
                Group {
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(spacing: 12) {
                            classificationButton(
                                title: "Still Learning",
                                systemImage: "arrow.triangle.2.circlepath",
                                color: AviationTheme.amber,
                                action: markUnknown
                            )
                            classificationButton(
                                title: "Got It",
                                systemImage: "checkmark",
                                color: AviationTheme.mint,
                                action: markKnown
                            )
                        }
                    } else {
                        HStack(spacing: 16) {
                            classificationButton(
                                title: "Still Learning",
                                systemImage: "arrow.triangle.2.circlepath",
                                color: AviationTheme.amber,
                                action: markUnknown
                            )
                            classificationButton(
                                title: "Got It",
                                systemImage: "checkmark",
                                color: AviationTheme.mint,
                                action: markKnown
                            )
                        }
                    }
                }
                
                // Navigation
                HStack(spacing: 20) {
                    Button(action: previousCard) {
                        Image(systemName: "chevron.left")
                            .font(.title2)
                            .foregroundColor(currentIndex > 0 ? .primary : .secondary)
                    }
                    .disabled(currentIndex == 0)
                    .accessibilityLabel("Previous card")
                    
                    Button(action: requestShuffle) {
                        Image(systemName: "shuffle")
                            .font(.title2)
                            .foregroundColor(.primary)
                    }
                    .accessibilityLabel("Shuffle cards")
                    
                    Button(action: requestRestart) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.title2)
                            .foregroundColor(.primary)
                    }
                    .accessibilityLabel("Restart deck")
                    
                    Button(action: nextCard) {
                        Image(systemName: "chevron.right")
                            .font(.title2)
                            .foregroundColor(currentIndex < cards.count - 1 ? .primary : .secondary)
                    }
                    .disabled(currentIndex >= cards.count - 1)
                    .accessibilityLabel("Next card")
                }
            }
            .padding()
            .background(Color(.systemBackground))
            }
            }
            .frame(maxWidth: .infinity, minHeight: 700)
        }
        .navigationTitle(deck.title)
        .navigationBarTitleDisplayMode(.inline)
        .aviationScreen()
        .sensoryFeedback(.selection, trigger: feedbackTrigger)
        .confirmationDialog(
            "Shuffle and restart this deck?",
            isPresented: $confirmShuffle,
            titleVisibility: .visible
        ) {
            Button("Shuffle and restart", role: .destructive, action: shuffleCards)
        } message: {
            Text("Your current card ratings will be cleared.")
        }
        .confirmationDialog(
            "Restart this deck?",
            isPresented: $confirmRestart,
            titleVisibility: .visible
        ) {
            Button("Restart deck", role: .destructive, action: resetDeck)
        } message: {
            Text("Your current card ratings will be cleared.")
        }
    }
    
    private func markKnown() {
        guard cards.indices.contains(currentIndex) else { return }
        let card = cards[currentIndex]
        progress.classify(cardID: card.id, asKnown: true, cardIDs: cardIDs)
        isFlipped = false
        feedbackTrigger += 1
    }

    private func flipCard() {
        if reduceMotion {
            isFlipped.toggle()
        } else {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                isFlipped.toggle()
            }
        }
    }

    private func classificationButton(
        title: String,
        systemImage: String,
        color: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundColor(color)
                .frame(maxWidth: .infinity)
                .padding()
                .background(color.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(color.opacity(0.3), lineWidth: 1)
                }
        }
    }
    
    private func markUnknown() {
        guard cards.indices.contains(currentIndex) else { return }
        let card = cards[currentIndex]
        progress.classify(cardID: card.id, asKnown: false, cardIDs: cardIDs)
        isFlipped = false
        feedbackTrigger += 1
    }
    
    private func nextCard() {
        progress.moveNext(cardCount: cards.count)
        isFlipped = false
    }
    
    private func previousCard() {
        progress.movePrevious()
        isFlipped = false
    }
    
    private func shuffleCards() {
        cards.shuffle()
        progress.restart()
        isFlipped = false
        feedbackTrigger += 1
    }
    
    private func resetDeck() {
        cards = deck.cards
        progress.restart()
        isFlipped = false
        feedbackTrigger += 1
    }

    private func requestShuffle() {
        if progress.assessedCount > 0 {
            confirmShuffle = true
        } else {
            shuffleCards()
        }
    }

    private func requestRestart() {
        if progress.assessedCount > 0 {
            confirmRestart = true
        } else {
            resetDeck()
        }
    }
}

private struct FlashcardCompletionView: View {
    let totalCount: Int
    let knownCount: Int
    let learningCount: Int
    let onRestart: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 58))
                .foregroundColor(AviationTheme.mint)
                .accessibilityHidden(true)

            Text("Deck Complete")
                .font(.title2.bold())
            Text("You reviewed \(totalCount) cards.")
                .foregroundColor(.secondary)

            HStack(spacing: 12) {
                completionStat(value: knownCount, label: "Got it", color: AviationTheme.mint)
                completionStat(value: learningCount, label: "Learning", color: AviationTheme.amber)
            }

            Button(action: onRestart) {
                Label("Restart Deck", systemImage: "arrow.counterclockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(maxWidth: 620)
        .background(AviationTheme.raisedSurface)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(AviationTheme.border, lineWidth: 1)
        }
    }

    private func completionStat(value: Int, label: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.title2.bold())
            Text(label)
                .font(.caption)
        }
        .foregroundColor(color)
        .frame(maxWidth: .infinity)
        .padding()
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct FlashcardView: View {
    let card: Flashcard
    let isFlipped: Bool
    
    var body: some View {
        ZStack {
            // Front
            CardFace(
                content: card.front,
                label: "Term",
                color: AviationTheme.raisedSurface,
                isVisible: !isFlipped
            )
            
            // Back
            CardFace(
                content: card.back,
                label: "Definition",
                subtitle: card.reference,
                color: AviationTheme.accent.opacity(0.1),
                isVisible: isFlipped
            )
            .rotation3DEffect(
                .degrees(180),
                axis: (x: 0, y: 1, z: 0)
            )
        }
        .rotation3DEffect(
            .degrees(isFlipped ? 180 : 0),
            axis: (x: 0, y: 1, z: 0)
        )
    }
}

struct CardFace: View {
    let content: String
    let label: String
    var subtitle: String? = nil
    let color: Color
    let isVisible: Bool
    
    var body: some View {
        VStack(spacing: 16) {
            Text(label.uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
            
            Spacer()
            
            Text(content)
                .font(.title2)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            
            Spacer()
            
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(AviationTheme.accent)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 300)
        .background(color)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(AviationTheme.border, lineWidth: 1)
        }
        .shadow(color: AviationTheme.ink.opacity(0.08), radius: 18, x: 0, y: 8)
        .opacity(isVisible ? 1 : 0)
    }
}

#Preview {
    FlashcardListView()
}
