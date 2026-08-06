package com.vacation.budget.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "budget")
data class Budget(
    @PrimaryKey val id: Int = 1,
    val totalAmount: Double = 0.0,
    val tripName: String = "My Vacation",
    val destination: String = "",
    val currency: String = "USD",
    val startDate: Long = System.currentTimeMillis(),
    val endDate: Long = System.currentTimeMillis() + 7 * 24 * 60 * 60 * 1000L
)
