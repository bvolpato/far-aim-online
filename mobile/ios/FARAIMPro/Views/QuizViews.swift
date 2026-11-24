//
//  QuizViews.swift
//  FARAIMPro
//
//  Views for quiz functionality
//

import SwiftUI

private enum QuizAnswerFeedback: Equatable {
    case none
    case correct
    case incorrect
}

struct QuizListView: View {
    @ObservedObject var dataService = DataService.shared
    
    var body: some View {
        ScrollView {
            if dataService.quizzes.isEmpty {
                LibraryCollectionStateView(
                    catalog: .quizzes,
                    title: "Quizzes",
                    systemImage: "checkmark.seal"
                )
            } else {
                LazyVStack(spacing: 12) {
                LibraryLoadErrorBanner(catalog: .quizzes)

                ReferenceLibraryBanner(
                    eyebrow: "KNOWLEDGE CHECK",
                    title: "Practice quizzes",
                    detail: "\(dataService.quizzes.reduce(0) { $0 + $1.questionCount }) questions across \(dataService.quizzes.count) quizzes",
                    icon: "checkmark.seal.fill"
                )

                ForEach(dataService.quizzes) { quiz in
                    NavigationLink(destination: QuizDetailView(quiz: quiz)) {
                        StudyResourceCard(
                            eyebrow: "\(quiz.category.uppercased()) · \(quiz.difficulty.uppercased())",
                            title: quiz.title,
                            description: quiz.description,
                            metrics: [
                                ("\(quiz.questionCount)", "questions"),
                                ("\(quiz.passingScore)%", "to pass")
                            ],
                            icon: "checkmark.seal.fill"
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
        .navigationTitle("Quizzes")
        .aviationScreen()
    }
}

struct StudyResourceCard: View {
    let eyebrow: String
    let title: String
    let description: String
    let metrics: [(value: String, label: String)]
    let icon: String

    var body: some View {
        HStack(alignment: .top, spacing: 15) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(AviationTheme.accent)
                .frame(width: 42, height: 42)
                .background(AviationTheme.accent.opacity(0.11))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 7) {
                Text(eyebrow)
                    .font(.caption2.weight(.bold))
                    .tracking(0.7)
                    .foregroundStyle(AviationTheme.accent)
                    .lineLimit(1)
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                HStack(spacing: 16) {
                    ForEach(Array(metrics.enumerated()), id: \.offset) { _, metric in
                        Text("\(metric.value) \(metric.label)")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer(minLength: 4)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
                .padding(.top, 14)
        }
        .padding(17)
        .background(AviationTheme.raisedSurface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(AviationTheme.border, lineWidth: 1)
        }
    }
}

struct QuizDetailView: View {
    let quiz: Quiz
    @State private var currentIndex = 0
    @State private var selectedAnswer: Int? = nil
    @State private var showExplanation = false
    @State private var correctCount = 0
    @State private var isQuizComplete = false
    @State private var answers: [Int: Int] = [:]
    @State private var answerFeedback = QuizAnswerFeedback.none
    
    var body: some View {
        VStack(spacing: 0) {
            if quiz.questions.isEmpty {
                ContentUnavailableView(
                    "No Questions Available",
                    systemImage: "questionmark.circle",
                    description: Text("This quiz currently has no questions.")
                )
            } else if isQuizComplete {
                QuizResultsView(
                    quiz: quiz,
                    correctCount: correctCount,
                    answers: answers,
                    onRestart: restartQuiz
                )
            } else {
                // Progress
                VStack(spacing: 8) {
                    HStack {
                        Text("Question \(currentIndex + 1) of \(quiz.questions.count)")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Spacer()
                        Text("\(Int(Double(currentIndex + 1) / Double(quiz.questions.count) * 100))%")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    
                    ProgressView(value: Double(currentIndex + 1), total: Double(quiz.questions.count))
                        .tint(AviationTheme.accent)
                }
                .padding()
                .background(Color(.systemBackground))
                
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        let question = quiz.questions[currentIndex]
                        
                        // Question
                        Text(question.question)
                            .font(.title3)
                            .fontWeight(.semibold)
                            .padding(.horizontal)
                        
                        // Options
                        VStack(spacing: 12) {
                            ForEach(0..<question.options.count, id: \.self) { index in
                                OptionButton(
                                    text: question.options[index],
                                    index: index,
                                    isSelected: selectedAnswer == index,
                                    isCorrect: showExplanation ? index == question.correctAnswer : nil,
                                    wasSelected: showExplanation && selectedAnswer == index
                                ) {
                                    if !showExplanation {
                                        // Immediately select and submit the answer
                                        selectedAnswer = index
                                        answers[currentIndex] = index
                                        if index == question.correctAnswer {
                                            correctCount += 1
                                            answerFeedback = .correct
                                        } else {
                                            answerFeedback = .incorrect
                                        }
                                        showExplanation = true
                                    }
                                }
                            }
                        }
                        .padding(.horizontal)
                        
                        // Explanation
                        if showExplanation {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Explanation")
                                    .font(.headline)
                                Text(question.explanation)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                Text("Reference: \(question.reference)")
                                    .font(.caption)
                                    .foregroundColor(.blue)
                            }
                            .padding()
                            .background(Color(.secondarySystemBackground))
                            .cornerRadius(12)
                            .padding(.horizontal)
                        }
                    }
                    .padding(.vertical)
                }
                
                // Action Button (only shown after answering)
                if showExplanation {
                    VStack {
                        Button(action: nextQuestion) {
                            Text(currentIndex < quiz.questions.count - 1 ? "Next Question" : "See Results")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(AviationTheme.ink)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                    .padding()
                    .background(Color(.systemBackground))
                }
            }
        }
        .navigationTitle(quiz.title)
        .navigationBarTitleDisplayMode(.inline)
        .aviationScreen()
        .sensoryFeedback(.success, trigger: answerFeedback) { _, newValue in
            newValue == .correct
        }
        .sensoryFeedback(.error, trigger: answerFeedback) { _, newValue in
            newValue == .incorrect
        }
    }
    
    private func nextQuestion() {
        if currentIndex < quiz.questions.count - 1 {
            currentIndex += 1
            selectedAnswer = nil
            showExplanation = false
            answerFeedback = .none
        } else {
            isQuizComplete = true
        }
    }
    
    private func restartQuiz() {
        currentIndex = 0
        selectedAnswer = nil
        showExplanation = false
        correctCount = 0
        isQuizComplete = false
        answers = [:]
        answerFeedback = .none
    }
}

struct OptionButton: View {
    let text: String
    let index: Int
    let isSelected: Bool
    let isCorrect: Bool?
    let wasSelected: Bool
    let action: () -> Void
    
    private var optionLabel: String {
        UnicodeScalar(65 + index).map { String($0) } ?? "\(index + 1)"
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(optionLabel)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .frame(width: 32, height: 32)
                    .background(backgroundColor)
                    .foregroundColor(textColor)
                    .cornerRadius(8)
                
                Text(text)
                    .font(.body)
                    .foregroundColor(.primary)
                    .multilineTextAlignment(.leading)
                
                Spacer()
                
                if let correct = isCorrect, correct || wasSelected {
                    Image(systemName: correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundColor(correct ? .green : .red)
                }
            }
            .padding()
            .background(cardBackgroundColor)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(borderColor, lineWidth: 2)
            )
        }
        .disabled(isCorrect != nil)
        .accessibilityValue(
            isCorrect == true
                ? "Correct answer"
                : (wasSelected && isCorrect == false ? "Incorrect selection" : (isSelected ? "Selected" : ""))
        )
    }
    
    private var backgroundColor: Color {
        if let correct = isCorrect {
            if correct { return .green }
            if wasSelected { return .red }
            return Color(.secondarySystemBackground)
        }
        return isSelected ? AviationTheme.accent : Color(.secondarySystemBackground)
    }
    
    private var textColor: Color {
        if let correct = isCorrect {
            return (correct || wasSelected) ? .white : .primary
        }
        return isSelected ? .white : .primary
    }
    
    private var cardBackgroundColor: Color {
        if let correct = isCorrect {
            if correct { return Color.green.opacity(0.1) }
            if wasSelected { return Color.red.opacity(0.1) }
        }
        return Color(.systemBackground)
    }
    
    private var borderColor: Color {
        if let correct = isCorrect {
            if correct { return .green }
            if wasSelected { return .red }
        }
        return isSelected ? AviationTheme.accent : Color(.separator)
    }
}

struct QuizResultsView: View {
    let quiz: Quiz
    let correctCount: Int
    let answers: [Int: Int]
    let onRestart: () -> Void
    
    var percentage: Int {
        guard !quiz.questions.isEmpty else { return 0 }
        return Int(Double(correctCount) / Double(quiz.questions.count) * 100)
    }

    private var missedQuestionIndices: [Int] {
        quiz.questions.indices.filter { index in
            answers[index] != quiz.questions[index].correctAnswer
        }
    }
    
    var passed: Bool {
        percentage >= quiz.passingScore
    }
    
    var body: some View {
        ZStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Result Header
                    VStack(spacing: 16) {
                        Image(systemName: passed ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .font(.system(size: 80))
                            .foregroundColor(passed ? .green : .orange)

                        Text(passed ? "Congratulations!" : "Keep Practicing!")
                            .font(.title)
                            .fontWeight(.bold)

                        Text(passed
                             ? "You passed the quiz!"
                             : "You need \(quiz.passingScore)% to pass.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)

                        Text("\(percentage)%")
                            .font(.system(size: 60, weight: .bold))
                            .foregroundColor(passed ? .green : .orange)

                        Text("\(correctCount) of \(quiz.questions.count) correct")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    
                    // Restart Button
                    Button(action: onRestart) {
                        Label("Try Again", systemImage: "arrow.counterclockwise")
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(AviationTheme.ink)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .padding(.horizontal)

                    if !missedQuestionIndices.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Review Missed Questions (\(missedQuestionIndices.count))")
                                .font(.headline)
                                .padding(.horizontal)

                            ForEach(missedQuestionIndices, id: \.self) { index in
                                let question = quiz.questions[index]
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Q\(index + 1). \(question.question)")
                                        .font(.subheadline.weight(.semibold))
                                    if let chosen = answers[index], question.options.indices.contains(chosen) {
                                        Label("Your answer: \(question.options[chosen])", systemImage: "xmark.circle.fill")
                                            .font(.caption)
                                            .foregroundColor(.red)
                                    }
                                    if question.options.indices.contains(question.correctAnswer) {
                                        Label("Correct: \(question.options[question.correctAnswer])", systemImage: "checkmark.circle.fill")
                                            .font(.caption)
                                            .foregroundColor(.green)
                                    }
                                    Text(question.explanation)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                    Text("Reference: \(question.reference)")
                                        .font(.caption2)
                                        .foregroundColor(AviationTheme.accent)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding()
                                .background(Color(.secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .padding(.horizontal)
                            }
                        }
                    }
                }
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
            }

            AirplaneCelebrationView(show: passed)
        }
        .aviationScreen()
    }
}

struct AirplaneCelebrationView: View {
    let show: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isVisible = false

    var body: some View {
        Group {
            if isVisible && !reduceMotion {
                GeometryReader { geometry in
                    ZStack(alignment: .topLeading) {
                        ForEach(0..<8, id: \.self) { _ in
                            FlyingAirplane(
                                delay: Double.random(in: 0...2),
                                screenWidth: max(geometry.size.width, 1),
                                screenHeight: max(geometry.size.height, 1)
                            )
                        }

                        ForEach(0..<50, id: \.self) { _ in
                            FallingConfetti(
                                delay: Double.random(in: 0...3),
                                screenWidth: max(geometry.size.width, 1),
                                screenHeight: max(geometry.size.height, 1)
                            )
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
        }
        .task(id: "\(show)-\(reduceMotion)") {
            guard show, !reduceMotion else {
                isVisible = false
                return
            }
            isVisible = true
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled else { return }
            isVisible = false
        }
    }
}

struct FlyingAirplane: View {
    let delay: Double
    let screenWidth: CGFloat
    let screenHeight: CGFloat

    @State private var offset: CGSize = .zero
    @State private var opacity: Double = 0

    var body: some View {
        Image(systemName: "airplane")
            .font(.system(size: 40))
            .foregroundColor(Color.blue)
            .offset(x: offset.width, y: offset.height)
            .opacity(opacity)
            .onAppear {
                let minY = min(100, screenHeight * 0.2)
                let maxY = max(minY + 1, screenHeight * 0.8)
                let startY = CGFloat.random(in: minY...maxY)
                offset = CGSize(width: -50, height: startY)

                withAnimation(.linear(duration: 0.5).delay(delay)) {
                    opacity = 1
                }

                withAnimation(.easeOut(duration: 4).delay(delay)) {
                    offset = CGSize(width: screenWidth + 100, height: startY - 200)
                    opacity = 0
                }
            }
    }
}

struct FallingConfetti: View {
    let delay: Double
    let screenWidth: CGFloat
    let screenHeight: CGFloat

    @State private var offset: CGSize = .zero
    @State private var opacity: Double = 0
    @State private var color: Color = [.red, .blue, .green, .yellow, .purple, .orange].randomElement() ?? .blue

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .offset(x: offset.width, y: offset.height)
            .opacity(opacity)
            .onAppear {
                let startX = CGFloat.random(in: 0...max(screenWidth, 1))
                offset = CGSize(width: startX, height: -20)

                withAnimation(.linear(duration: 0.2).delay(delay)) {
                    opacity = 1
                }

                withAnimation(.linear(duration: 3).delay(delay)) {
                    offset = CGSize(width: startX, height: screenHeight + 20)
                    opacity = 0
                }
            }
    }
}

#Preview {
    QuizListView()
}
