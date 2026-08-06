package com.vacation.budget.ui

import android.content.ContentUris
import android.content.Intent
import android.provider.CalendarContract
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.vacation.budget.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

data class CalendarEvent(
    val id: Long,
    val title: String,
    val description: String,
    val location: String,
    val startTime: Long,
    val endTime: Long,
    val calendarName: String,
    val color: Int
)

@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
@Composable
fun ItineraryScreen() {
    val context = LocalContext.current
    val calendarPermissions = rememberMultiplePermissionsState(
        listOf(
            android.Manifest.permission.READ_CALENDAR,
            android.Manifest.permission.WRITE_CALENDAR
        )
    )

    var selectedDate by remember { mutableStateOf(Calendar.getInstance()) }
    var events by remember { mutableStateOf<List<CalendarEvent>>(emptyList()) }
    var showAddEventDialog by remember { mutableStateOf(false) }
    var eventToView by remember { mutableStateOf<CalendarEvent?>(null) }

    LaunchedEffect(selectedDate, calendarPermissions.allPermissionsGranted) {
        if (calendarPermissions.allPermissionsGranted) {
            events = loadCalendarEvents(context, selectedDate)
        }
    }

    Scaffold(
        floatingActionButton = {
            if (calendarPermissions.allPermissionsGranted) {
                ExtendedFloatingActionButton(
                    onClick = { showAddEventDialog = true },
                    icon = { Icon(Icons.Default.EventNote, "Add event") },
                    text = { Text("Add to Calendar") },
                    containerColor = TropicalTeal,
                    contentColor = Color.White
                )
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(padding),
            contentPadding = PaddingValues(bottom = 88.dp)
        ) {
            item { ItineraryHeader(selectedDate, onDateChange = { selectedDate = it }) }

            item { WeekDateRow(selectedDate, onDateSelected = { selectedDate = it }) }

            if (!calendarPermissions.allPermissionsGranted) {
                item { CalendarPermissionCard(onRequest = { calendarPermissions.launchMultiplePermissionRequest() }) }
            } else {
                item {
                    SelectedDayHeader(selectedDate, events.size)
                }
                if (events.isEmpty()) {
                    item { EmptyItineraryState(selectedDate, onAdd = { showAddEventDialog = true }) }
                } else {
                    items(events) { event ->
                        EventCard(event = event, onClick = { eventToView = it })
                    }
                }
            }
        }
    }

    if (showAddEventDialog) {
        AddEventDialog(
            selectedDate = selectedDate,
            onDismiss = { showAddEventDialog = false },
            onAdd = { title, desc, location, start, end ->
                val intent = Intent(Intent.ACTION_INSERT).apply {
                    data = CalendarContract.Events.CONTENT_URI
                    putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
                    putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end)
                    putExtra(CalendarContract.Events.TITLE, title)
                    putExtra(CalendarContract.Events.DESCRIPTION, desc)
                    putExtra(CalendarContract.Events.EVENT_LOCATION, location)
                }
                context.startActivity(intent)
                showAddEventDialog = false
            }
        )
    }

    eventToView?.let { event ->
        EventDetailDialog(event = event, onDismiss = { eventToView = null },
            onOpenInCalendar = {
                val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, event.id)
                val intent = Intent(Intent.ACTION_VIEW).apply { data = uri }
                context.startActivity(intent)
                eventToView = null
            }
        )
    }
}

@Composable
private fun ItineraryHeader(selectedDate: Calendar, onDateChange: (Calendar) -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(colors = listOf(TropicalTeal, Color(0xFF00858A))))
            .padding(24.dp)
    ) {
        Column {
            Text(
                "Activity Itinerary",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Text(
                "Synced with Google Calendar",
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.75f)
            )
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = {
                        onDateChange((selectedDate.clone() as Calendar).apply { add(Calendar.MONTH, -1) })
                    },
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.2f))
                ) {
                    Icon(Icons.Default.ChevronLeft, "Prev month", tint = Color.White)
                }
                Text(
                    SimpleDateFormat("MMMM yyyy", Locale.getDefault()).format(selectedDate.time),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White
                )
                IconButton(
                    onClick = {
                        onDateChange((selectedDate.clone() as Calendar).apply { add(Calendar.MONTH, 1) })
                    },
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.2f))
                ) {
                    Icon(Icons.Default.ChevronRight, "Next month", tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun WeekDateRow(selectedDate: Calendar, onDateSelected: (Calendar) -> Unit) {
    val today = Calendar.getInstance()
    val weekDays = remember(selectedDate) {
        val start = (selectedDate.clone() as Calendar).apply {
            set(Calendar.DAY_OF_WEEK, firstDayOfWeek)
        }
        (0 until 7).map { i ->
            (start.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, i) }
        }
    }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 2.dp
    ) {
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            items(weekDays) { day ->
                val isSelected = day.get(Calendar.DAY_OF_YEAR) == selectedDate.get(Calendar.DAY_OF_YEAR) &&
                        day.get(Calendar.YEAR) == selectedDate.get(Calendar.YEAR)
                val isToday = day.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR) &&
                        day.get(Calendar.YEAR) == today.get(Calendar.YEAR)

                Column(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            when {
                                isSelected -> TropicalTeal
                                else -> Color.Transparent
                            }
                        )
                        .border(
                            width = if (isToday && !isSelected) 2.dp else 0.dp,
                            color = if (isToday && !isSelected) TropicalTeal else Color.Transparent,
                            shape = RoundedCornerShape(12.dp)
                        )
                        .clickable {
                            onDateSelected(
                                (selectedDate.clone() as Calendar).apply {
                                    set(Calendar.DAY_OF_MONTH, day.get(Calendar.DAY_OF_MONTH))
                                    set(Calendar.MONTH, day.get(Calendar.MONTH))
                                    set(Calendar.YEAR, day.get(Calendar.YEAR))
                                }
                            )
                        }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        SimpleDateFormat("EEE", Locale.getDefault()).format(day.time).uppercase(),
                        style = MaterialTheme.typography.labelMedium,
                        color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        day.get(Calendar.DAY_OF_MONTH).toString(),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = if (isSelected || isToday) FontWeight.Bold else FontWeight.Normal,
                        color = if (isSelected) Color.White
                        else if (isToday) TropicalTeal
                        else MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }
    }
    HorizontalDivider()
}

@Composable
private fun SelectedDayHeader(date: Calendar, eventCount: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                SimpleDateFormat("EEEE", Locale.getDefault()).format(date.time),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                SimpleDateFormat("MMMM d, yyyy", Locale.getDefault()).format(date.time),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (eventCount > 0) {
            Surface(shape = CircleShape, color = TropicalTeal) {
                Text(
                    "$eventCount",
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun EventCard(event: CalendarEvent, onClick: (CalendarEvent) -> Unit) {
    val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
    val eventColor = Color(event.color).let {
        if (it == Color.Unspecified || event.color == 0) TropicalTeal else it
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        onClick = { onClick(event) }
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            // Color accent bar
            Box(
                modifier = Modifier
                    .width(6.dp)
                    .fillMaxHeight()
                    .background(eventColor, shape = RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp))
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 14.dp, top = 14.dp, end = 16.dp, bottom = 14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Text(
                        event.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = eventColor.copy(alpha = 0.1f)
                    ) {
                        Text(
                            event.calendarName,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelMedium,
                            color = eventColor,
                            maxLines = 1
                        )
                    }
                }

                Spacer(Modifier.height(6.dp))

                // Time row
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Schedule, null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        "${timeFormat.format(Date(event.startTime))} – ${timeFormat.format(Date(event.endTime))}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                if (event.location.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.LocationOn, null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            event.location,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                if (event.description.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        event.description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun CalendarPermissionCard(onRequest: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("📅", fontSize = 56.sp)
            Spacer(Modifier.height(16.dp))
            Text(
                "Calendar Access",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Allow access to your Google Calendar to view and add vacation activities to your itinerary.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = onRequest,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = TropicalTeal)
            ) {
                Icon(Icons.Default.CalendarMonth, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Connect Google Calendar")
            }
        }
    }
}

@Composable
private fun EmptyItineraryState(selectedDate: Calendar, onAdd: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("🗓️", fontSize = 56.sp)
        Spacer(Modifier.height(16.dp))
        Text(
            "No activities planned",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            "Add events to your itinerary for ${SimpleDateFormat("MMMM d", Locale.getDefault()).format(selectedDate.time)}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Spacer(Modifier.height(20.dp))
        OutlinedButton(
            onClick = onAdd,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = TropicalTeal),
            border = BorderStroke(1.5.dp, TropicalTeal)
        ) {
            Icon(Icons.Default.Add, null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text("Add Activity")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddEventDialog(
    selectedDate: Calendar,
    onDismiss: () -> Unit,
    onAdd: (title: String, desc: String, location: String, start: Long, end: Long) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var startHour by remember { mutableStateOf(9) }
    var startMinute by remember { mutableStateOf(0) }
    var endHour by remember { mutableStateOf(10) }
    var endMinute by remember { mutableStateOf(0) }
    var titleError by remember { mutableStateOf(false) }
    var showStartTimePicker by remember { mutableStateOf(false) }
    var showEndTimePicker by remember { mutableStateOf(false) }

    fun buildTime(hour: Int, minute: Int): Long {
        return (selectedDate.clone() as Calendar).apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
        }.timeInMillis
    }

    fun formatTime(h: Int, m: Int): String {
        val amPm = if (h < 12) "AM" else "PM"
        val hour = if (h == 0 || h == 12) 12 else h % 12
        return "%d:%02d %s".format(hour, m, amPm)
    }

    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            shape = RoundedCornerShape(24.dp)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Add Activity",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, "Close")
                    }
                }

                Spacer(Modifier.height(16.dp))

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it; titleError = false },
                    label = { Text("Activity Name *") },
                    leadingIcon = { Icon(Icons.Default.EventNote, null) },
                    isError = titleError,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true
                )

                Spacer(Modifier.height(12.dp))

                OutlinedTextField(
                    value = location,
                    onValueChange = { location = it },
                    label = { Text("Location") },
                    leadingIcon = { Icon(Icons.Default.LocationOn, null) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true
                )

                Spacer(Modifier.height(12.dp))

                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Notes") },
                    leadingIcon = { Icon(Icons.Default.Notes, null) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    minLines = 2,
                    maxLines = 3
                )

                Spacer(Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = formatTime(startHour, startMinute),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Start Time") },
                        leadingIcon = { Icon(Icons.Default.Schedule, null) },
                        modifier = Modifier
                            .weight(1f)
                            .clickable { showStartTimePicker = true },
                        shape = RoundedCornerShape(12.dp)
                    )
                    OutlinedTextField(
                        value = formatTime(endHour, endMinute),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("End Time") },
                        leadingIcon = { Icon(Icons.Default.Schedule, null) },
                        modifier = Modifier
                            .weight(1f)
                            .clickable { showEndTimePicker = true },
                        shape = RoundedCornerShape(12.dp)
                    )
                }

                Spacer(Modifier.height(24.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp)
                    ) { Text("Cancel") }
                    Button(
                        onClick = {
                            titleError = title.isBlank()
                            if (!titleError) {
                                onAdd(
                                    title.trim(), description.trim(), location.trim(),
                                    buildTime(startHour, startMinute),
                                    buildTime(endHour, endMinute)
                                )
                            }
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = TropicalTeal)
                    ) {
                        Icon(Icons.Default.CalendarMonth, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Add to Calendar")
                    }
                }
            }
        }
    }

    if (showStartTimePicker) {
        val state = rememberTimePickerState(initialHour = startHour, initialMinute = startMinute)
        TimePickerDialog(
            onDismiss = { showStartTimePicker = false },
            onConfirm = { startHour = state.hour; startMinute = state.minute; showStartTimePicker = false }
        ) { TimePicker(state = state) }
    }

    if (showEndTimePicker) {
        val state = rememberTimePickerState(initialHour = endHour, initialMinute = endMinute)
        TimePickerDialog(
            onDismiss = { showEndTimePicker = false },
            onConfirm = { endHour = state.hour; endMinute = state.minute; showEndTimePicker = false }
        ) { TimePicker(state = state) }
    }
}

@Composable
private fun TimePickerDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    content: @Composable () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        confirmButton = { TextButton(onClick = onConfirm) { Text("OK") } },
        text = { content() }
    )
}

@Composable
private fun EventDetailDialog(
    event: CalendarEvent,
    onDismiss: () -> Unit,
    onOpenInCalendar: () -> Unit
) {
    val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Text("📅", fontSize = 32.sp) },
        title = {
            Text(event.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Schedule, null, Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(6.dp))
                    Text("${timeFormat.format(Date(event.startTime))} – ${timeFormat.format(Date(event.endTime))}")
                }
                if (event.location.isNotBlank()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.LocationOn, null, Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(6.dp))
                        Text(event.location)
                    }
                }
                if (event.description.isNotBlank()) {
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(Icons.Default.Notes, null, Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(6.dp))
                        Text(event.description)
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CalendarMonth, null, Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(6.dp))
                    Text(event.calendarName, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
        confirmButton = {
            Button(onClick = onOpenInCalendar, shape = RoundedCornerShape(10.dp)) {
                Text("Open in Calendar")
            }
        }
    )
}

private fun loadCalendarEvents(context: android.content.Context, date: Calendar): List<CalendarEvent> {
    val startOfDay = (date.clone() as Calendar).apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
    }.timeInMillis
    val endOfDay = (date.clone() as Calendar).apply {
        set(Calendar.HOUR_OF_DAY, 23); set(Calendar.MINUTE, 59); set(Calendar.SECOND, 59)
    }.timeInMillis

    val events = mutableListOf<CalendarEvent>()
    try {
        val cursor = context.contentResolver.query(
            CalendarContract.Events.CONTENT_URI,
            arrayOf(
                CalendarContract.Events._ID,
                CalendarContract.Events.TITLE,
                CalendarContract.Events.DESCRIPTION,
                CalendarContract.Events.EVENT_LOCATION,
                CalendarContract.Events.DTSTART,
                CalendarContract.Events.DTEND,
                CalendarContract.Events.CALENDAR_DISPLAY_NAME,
                CalendarContract.Events.DISPLAY_COLOR
            ),
            "${CalendarContract.Events.DTSTART} >= ? AND ${CalendarContract.Events.DTSTART} <= ? AND ${CalendarContract.Events.DELETED} = 0",
            arrayOf(startOfDay.toString(), endOfDay.toString()),
            "${CalendarContract.Events.DTSTART} ASC"
        )
        cursor?.use {
            while (it.moveToNext()) {
                events.add(
                    CalendarEvent(
                        id = it.getLong(0),
                        title = it.getString(1) ?: "Untitled",
                        description = it.getString(2) ?: "",
                        location = it.getString(3) ?: "",
                        startTime = it.getLong(4),
                        endTime = it.getLong(5),
                        calendarName = it.getString(6) ?: "Calendar",
                        color = it.getInt(7)
                    )
                )
            }
        }
    } catch (_: Exception) {}
    return events
}
