package com.vacation.budget.data

import androidx.room.Entity
import androidx.room.PrimaryKey

enum class ExpenseCategory(val displayName: String, val emoji: String) {
    FOOD("Food & Dining", "🍽️"),
    TRANSPORT("Transportation", "✈️"),
    ACCOMMODATION("Accommodation", "🏨"),
    ACTIVITIES("Activities", "🎭"),
    SHOPPING("Shopping", "🛍️"),
    OTHER("Other", "💼")
}

@Entity(tableName = "expenses")
data class Expense(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val amount: Double,
    val location: String,
    val category: String = ExpenseCategory.OTHER.name,
    val date: Long = System.currentTimeMillis(),
    val notes: String = ""
) {
    val categoryEnum: ExpenseCategory
        get() = runCatching { ExpenseCategory.valueOf(category) }.getOrDefault(ExpenseCategory.OTHER)
}
