
# How to Write Content for Arbor

Arbor uses a simple and readable format called `.arbor` (similar to Markdown). This guide shows you how to structure your lessons using the **At-Rule (`@`) Syntax**.

## 1. File Metadata
Every file should start with metadata to define its appearance in the tree.

```text
@title: Introduction to Physics
@icon: ⚛️
@description: Learn the fundamental forces of the universe.
@order: 1
```

*   **@title**: The name shown on the tree node.
*   **@icon**: An emoji to represent the node.
*   **@description**: A short summary.
*   **@order**: (Optional) Number to sort nodes in the list.

---

## 2. Text and Formatting
You can write normal text just like a document.

*   **Bold**: Use `**text**` -> **text**
*   **Italic**: Use `*text*` -> *text*
*   **Code**: Use `` `code` `` -> `code`
*   **Headers**: Use `#` for main titles and `##` for subtitles.

```text
# The Laws of Motion
Sir Isaac Newton described **three** laws.
```

---

## 3. Adding Media
Use the `@` syntax to embed media easily.

### Images
```text
@image: https://example.com/diagram.png
```

### Videos
You can paste YouTube links or direct video files.
```text
@video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

### Audio
```text
@audio: https://example.com/podcast_episode.mp3
```

---

## 4. Creating Quizzes
You can add interactive quizzes anywhere in the text.

*   Start with `@quiz:` followed by the question.
*   Use `@correct:` for the right answer.
*   Use `@option:` for wrong answers.

```text
@quiz: What is the unit of force?
@option: Joule
@correct: Newton
@option: Watt
@option: Pascal
```

---

## Example of a Full File

```text
@title: Solar System
@icon: 🪐
@description: A tour of our celestial neighborhood.

# The Sun
The Sun is the star at the center of the Solar System. It is a nearly perfect sphere of hot plasma.

@image: https://upload.wikimedia.org/wikipedia/commons/b/b4/The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg

## The Planets
There are 8 planets.

- Mercury
- Venus
- Earth
- Mars

@video: https://www.youtube.com/watch?v=libKVRa01L8

@quiz: Which planet is closest to the Sun?
@correct: Mercury
@option: Venus
@option: Earth

Great job!
```
